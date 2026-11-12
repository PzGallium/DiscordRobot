import { getDb } from '../db/index.js';
import { fromSqliteDatetime, toSqliteDatetime } from '../utils/time.js';
import { applyDelta, EconomyError, withTransaction } from './economy.js';
import { getGuildSettings } from './guildSettings.js';
import { ensureUser, getUserById, type UserRow } from './user.js';

export type RedPacketStatus = 'open' | 'closed' | 'expired';

export type RedPacketRow = {
  id: number;
  guild_id: string;
  total_amount: number;
  count: number;
  remaining_amount: number;
  remaining_count: number;
  created_by: number;
  channel_id: string | null;
  message_id: string | null;
  status: RedPacketStatus;
  expires_at: string;
  created_at: string;
};

export type ExpiredRedPacket = {
  packet: RedPacketRow;
  refunded: number;
};

/** Random claim amount using 二倍均值法, last packet takes remainder. */
export function rollClaimAmount(remainingAmount: number, remainingCount: number): number {
  if (remainingCount <= 0) throw new EconomyError('No packets left');
  if (remainingCount === 1) return remainingAmount;
  const max = Math.floor((remainingAmount / remainingCount) * 2);
  const amount = Math.max(1, Math.floor(Math.random() * max) + 1);
  return Math.min(amount, remainingAmount - (remainingCount - 1));
}

export function createRedPacket(input: {
  guildId: string;
  creatorDiscordId: string;
  creatorNickname: string;
  totalAmount: number;
  count: number;
  channelId: string;
}): { packet: RedPacketRow; creator: UserRow } {
  if (!Number.isInteger(input.totalAmount) || input.totalAmount <= 0) {
    throw new EconomyError('Total must be a positive integer');
  }
  if (!Number.isInteger(input.count) || input.count <= 0 || input.count > 100) {
    throw new EconomyError('Count must be between 1 and 100');
  }
  if (input.totalAmount < input.count) {
    throw new EconomyError('Total must be at least 1 per packet');
  }

  return withTransaction((db) => {
    const creator = ensureUser(input.guildId, input.creatorDiscordId, input.creatorNickname);
    const settings = getGuildSettings(input.guildId);
    const expiresAt = new Date(Date.now() + settings.redPacketExpireMs);

    applyDelta({
      db,
      guildId: input.guildId,
      userId: creator.id,
      delta: -input.totalAmount,
      type: 'redpacket_create',
      description: `Created red packet ${input.totalAmount} x${input.count}`,
    });

    const result = db
      .prepare(
        `INSERT INTO red_packets
         (guild_id, total_amount, count, remaining_amount, remaining_count, created_by, channel_id, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        input.guildId,
        input.totalAmount,
        input.count,
        input.totalAmount,
        input.count,
        creator.id,
        input.channelId,
        toSqliteDatetime(expiresAt),
      );

    return {
      packet: getRedPacket(Number(result.lastInsertRowid))!,
      creator: getUserById(creator.id)!,
    };
  });
}

export function getRedPacket(id: number): RedPacketRow | undefined {
  return getDb().prepare(`SELECT * FROM red_packets WHERE id = ?`).get(id) as RedPacketRow | undefined;
}

export function setRedPacketMessage(id: number, messageId: string): void {
  getDb().prepare(`UPDATE red_packets SET message_id = ? WHERE id = ?`).run(messageId, id);
}

function expireRedPacket(
  db: ReturnType<typeof getDb>,
  packet: RedPacketRow,
): ExpiredRedPacket {
  const refunded = packet.remaining_amount;
  if (refunded > 0) {
    applyDelta({
      db,
      guildId: packet.guild_id,
      userId: packet.created_by,
      delta: refunded,
      type: 'redpacket_refund',
      refType: 'red_packet',
      refId: packet.id,
      description: `Red packet #${packet.id} expired, refund ${refunded}`,
    });
  }

  db.prepare(
    `UPDATE red_packets
     SET remaining_amount = 0, remaining_count = 0, status = 'expired'
     WHERE id = ?`,
  ).run(packet.id);

  const updated = db.prepare(`SELECT * FROM red_packets WHERE id = ?`).get(packet.id) as RedPacketRow;
  return { packet: updated, refunded };
}

export function expireOpenRedPackets(): ExpiredRedPacket[] {
  const db = getDb();
  const due = db
    .prepare(`SELECT * FROM red_packets WHERE status = 'open' AND expires_at <= ?`)
    .all(toSqliteDatetime()) as RedPacketRow[];

  const expired: ExpiredRedPacket[] = [];
  for (const packet of due) {
    const result = withTransaction((txDb) => {
      const current = txDb
        .prepare(`SELECT * FROM red_packets WHERE id = ?`)
        .get(packet.id) as RedPacketRow | undefined;
      if (!current || current.status !== 'open') return null;
      return expireRedPacket(txDb, current);
    });
    if (result) expired.push(result);
  }
  return expired;
}

export function claimRedPacket(input: {
  packetId: number;
  guildId: string;
  discordId: string;
  nickname: string;
}): { amount: number; packet: RedPacketRow; user: UserRow } {
  const result = withTransaction((db) => {
    const packet = db
      .prepare(`SELECT * FROM red_packets WHERE id = ?`)
      .get(input.packetId) as RedPacketRow | undefined;

    if (!packet || packet.guild_id !== input.guildId) {
      throw new EconomyError('Red packet not found');
    }
    if (packet.status === 'open' && fromSqliteDatetime(packet.expires_at).getTime() <= Date.now()) {
      return { kind: 'expired' as const, result: expireRedPacket(db, packet) };
    }
    if (packet.status === 'expired') {
      return { kind: 'expired' as const, result: { packet, refunded: 0 } };
    }
    if (packet.status !== 'open' || packet.remaining_count <= 0) {
      throw new EconomyError('This red packet is finished');
    }

    const user = ensureUser(input.guildId, input.discordId, input.nickname);

    const already = db
      .prepare(`SELECT id FROM red_packet_claims WHERE red_packet_id = ? AND user_id = ?`)
      .get(packet.id, user.id);
    if (already) {
      throw new EconomyError('You already claimed this red packet');
    }

    const amount = rollClaimAmount(packet.remaining_amount, packet.remaining_count);
    const remainingAmount = packet.remaining_amount - amount;
    const remainingCount = packet.remaining_count - 1;
    const status: RedPacketStatus = remainingCount === 0 ? 'closed' : 'open';

    db.prepare(
      `UPDATE red_packets
       SET remaining_amount = ?, remaining_count = ?, status = ?
       WHERE id = ?`,
    ).run(remainingAmount, remainingCount, status, packet.id);

    db.prepare(
      `INSERT INTO red_packet_claims (red_packet_id, user_id, amount) VALUES (?, ?, ?)`,
    ).run(packet.id, user.id, amount);

    applyDelta({
      db,
      guildId: input.guildId,
      userId: user.id,
      delta: amount,
      type: 'redpacket_claim',
      refType: 'red_packet',
      refId: packet.id,
      description: `Claimed ${amount} from red packet #${packet.id}`,
    });

    return {
      kind: 'claimed' as const,
      result: {
        amount,
        packet: getRedPacket(packet.id)!,
        user: getUserById(user.id)!,
      },
    };
  });

  if (result.kind === 'expired') {
    throw new EconomyError('This red packet expired; the remaining balance was refunded');
  }
  return result.result;
}
