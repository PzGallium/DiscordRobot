import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import { getUserById, type UserRow } from './user.js';

export type TxType =
  | 'register'
  | 'daily'
  | 'bet'
  | 'bet_win'
  | 'fee_burn'
  | 'transfer_hold'
  | 'transfer_receive'
  | 'transfer_refund'
  | 'transfer_fee'
  | 'redpacket_create'
  | 'redpacket_claim'
  | 'admin_adjust';

export type ApplyDeltaInput = {
  guildId: string;
  userId: number | null;
  delta: number;
  type: TxType;
  description?: string;
  refType?: string;
  refId?: number;
  /** When set, use this connection/transaction context */
  db?: Database.Database;
};

export class EconomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EconomyError';
  }
}

/**
 * Apply a balance delta and write a ledger row inside a single statement batch.
 * Pass userId=null for fee burns that do not touch a user account.
 */
export function applyDelta(input: ApplyDeltaInput): { balanceAfter: number | null; user: UserRow | null } {
  const db = input.db ?? getDb();

  if (input.userId === null) {
    if (input.type !== 'fee_burn') {
      throw new EconomyError('Only fee_burn may omit userId');
    }
    db.prepare(
      `INSERT INTO transactions (guild_id, user_id, type, amount, balance_after, ref_type, ref_id, description)
       VALUES (?, NULL, ?, ?, NULL, ?, ?, ?)`,
    ).run(
      input.guildId,
      input.type,
      input.delta,
      input.refType ?? null,
      input.refId ?? null,
      input.description ?? null,
    );
    return { balanceAfter: null, user: null };
  }

  const user = db
    .prepare(
      `SELECT id, guild_id, discord_id, nickname, balance, last_daily_at, created_at
       FROM users WHERE id = ?`,
    )
    .get(input.userId) as UserRow | undefined;

  if (!user) {
    throw new EconomyError('User not found');
  }
  if (user.guild_id !== input.guildId) {
    throw new EconomyError('Guild mismatch');
  }

  const next = user.balance + input.delta;
  if (next < 0) {
    throw new EconomyError('Insufficient balance');
  }

  db.prepare(`UPDATE users SET balance = ? WHERE id = ?`).run(next, user.id);
  db.prepare(
    `INSERT INTO transactions (guild_id, user_id, type, amount, balance_after, ref_type, ref_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.guildId,
    user.id,
    input.type,
    input.delta,
    next,
    input.refType ?? null,
    input.refId ?? null,
    input.description ?? null,
  );

  return { balanceAfter: next, user: { ...user, balance: next } };
}

export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const run = db.transaction(() => fn(db));
  return run();
}

export function getBalance(userId: number): number {
  const user = getUserById(userId);
  if (!user) throw new EconomyError('User not found');
  return user.balance;
}
