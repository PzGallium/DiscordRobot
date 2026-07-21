import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { toSqliteDatetime } from '../utils/time.js';
import { applyDelta, EconomyError, withTransaction } from './economy.js';
import { ensureUser, getUserById, type UserRow } from './user.js';

export type TransferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export type TransferRow = {
  id: number;
  guild_id: string;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  fee: number;
  status: TransferStatus;
  channel_id: string | null;
  message_id: string | null;
  created_at: string;
  expires_at: string;
};

export function calcTransferFee(amount: number): number {
  return Math.floor((amount * config.transferFeeBps) / 10000);
}

export function createTransfer(input: {
  guildId: string;
  fromDiscordId: string;
  fromNickname: string;
  toDiscordId: string;
  toNickname: string;
  amount: number;
  channelId: string;
}): { transfer: TransferRow; from: UserRow; to: UserRow; totalDebit: number } {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new EconomyError('Amount must be a positive integer');
  }
  if (input.fromDiscordId === input.toDiscordId) {
    throw new EconomyError('Cannot transfer to yourself');
  }

  const fee = calcTransferFee(input.amount);
  const totalDebit = input.amount + fee;

  return withTransaction((db) => {
    const from = ensureUser(input.guildId, input.fromDiscordId, input.fromNickname);
    const to = ensureUser(input.guildId, input.toDiscordId, input.toNickname);

    applyDelta({
      db,
      guildId: input.guildId,
      userId: from.id,
      delta: -totalDebit,
      type: 'transfer_hold',
      description: `Transfer hold ${input.amount} + fee ${fee} to ${to.discord_id}`,
    });

    const expiresAt = new Date(Date.now() + config.transferExpireMs);
    const result = db
      .prepare(
        `INSERT INTO transfers
         (guild_id, from_user_id, to_user_id, amount, fee, status, channel_id, expires_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        input.guildId,
        from.id,
        to.id,
        input.amount,
        fee,
        input.channelId,
        toSqliteDatetime(expiresAt),
      );

    const transfer = getTransfer(Number(result.lastInsertRowid))!;
    return {
      transfer,
      from: getUserById(from.id)!,
      to,
      totalDebit,
    };
  });
}

export function getTransfer(id: number): TransferRow | undefined {
  return getDb().prepare(`SELECT * FROM transfers WHERE id = ?`).get(id) as TransferRow | undefined;
}

export function setTransferMessage(id: number, messageId: string): void {
  getDb().prepare(`UPDATE transfers SET message_id = ? WHERE id = ?`).run(messageId, id);
}

export function acceptTransfer(transferId: number, actorDiscordId: string): {
  transfer: TransferRow;
  to: UserRow;
} {
  return withTransaction((db) => {
    const transfer = db
      .prepare(`SELECT * FROM transfers WHERE id = ?`)
      .get(transferId) as TransferRow | undefined;
    if (!transfer) throw new EconomyError('Transfer not found');
    if (transfer.status !== 'pending') throw new EconomyError('Transfer is not pending');

    const to = getUserById(transfer.to_user_id);
    if (!to || to.discord_id !== actorDiscordId) {
      throw new EconomyError('Only the recipient can accept');
    }

    applyDelta({
      db,
      guildId: transfer.guild_id,
      userId: to.id,
      delta: transfer.amount,
      type: 'transfer_receive',
      refType: 'transfer',
      refId: transfer.id,
      description: `Received transfer #${transfer.id}`,
    });

    if (transfer.fee > 0) {
      applyDelta({
        db,
        guildId: transfer.guild_id,
        userId: null,
        delta: -transfer.fee,
        type: 'fee_burn',
        refType: 'transfer',
        refId: transfer.id,
        description: `Transfer #${transfer.id} fee burn ${transfer.fee}`,
      });
    }

    db.prepare(`UPDATE transfers SET status = 'accepted' WHERE id = ?`).run(transfer.id);
    return { transfer: { ...transfer, status: 'accepted' }, to: getUserById(to.id)! };
  });
}

export function rejectTransfer(transferId: number, actorDiscordId: string): TransferRow {
  return withTransaction((db) => {
    const transfer = db
      .prepare(`SELECT * FROM transfers WHERE id = ?`)
      .get(transferId) as TransferRow | undefined;
    if (!transfer) throw new EconomyError('Transfer not found');
    if (transfer.status !== 'pending') throw new EconomyError('Transfer is not pending');

    const to = getUserById(transfer.to_user_id);
    const from = getUserById(transfer.from_user_id);
    if (!to || !from) throw new EconomyError('User missing');

    if (to.discord_id !== actorDiscordId && from.discord_id !== actorDiscordId) {
      throw new EconomyError('Only sender or recipient can reject');
    }

    const refund = transfer.amount + transfer.fee;
    applyDelta({
      db,
      guildId: transfer.guild_id,
      userId: from.id,
      delta: refund,
      type: 'transfer_refund',
      refType: 'transfer',
      refId: transfer.id,
      description: `Transfer #${transfer.id} rejected, refund ${refund}`,
    });

    db.prepare(`UPDATE transfers SET status = 'rejected' WHERE id = ?`).run(transfer.id);
    return { ...transfer, status: 'rejected' };
  });
}

export function expirePendingTransfers(): TransferRow[] {
  const db = getDb();
  const now = toSqliteDatetime();
  const pending = db
    .prepare(`SELECT * FROM transfers WHERE status = 'pending' AND expires_at <= ?`)
    .all(now) as TransferRow[];

  const expired: TransferRow[] = [];
  for (const transfer of pending) {
    try {
      const result = withTransaction((txDb) => {
        const current = txDb
          .prepare(`SELECT * FROM transfers WHERE id = ?`)
          .get(transfer.id) as TransferRow;
        if (!current || current.status !== 'pending') return null;

        const refund = current.amount + current.fee;
        applyDelta({
          db: txDb,
          guildId: current.guild_id,
          userId: current.from_user_id,
          delta: refund,
          type: 'transfer_refund',
          refType: 'transfer',
          refId: current.id,
          description: `Transfer #${current.id} expired, refund ${refund}`,
        });
        txDb.prepare(`UPDATE transfers SET status = 'expired' WHERE id = ?`).run(current.id);
        return { ...current, status: 'expired' as const };
      });
      if (result) expired.push(result);
    } catch {
      // continue other transfers
    }
  }
  return expired;
}
