import { getDb } from '../db/index.js';
import { toSqliteDatetime } from '../utils/time.js';
import { getGuildSettings } from './guildSettings.js';

export type UserRow = {
  id: number;
  guild_id: string;
  discord_id: string;
  nickname: string;
  balance: number;
  last_daily_at: string | null;
  created_at: string;
};

export function ensureUser(guildId: string, discordId: string, nickname: string): UserRow {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, guild_id, discord_id, nickname, balance, last_daily_at, created_at
       FROM users WHERE guild_id = ? AND discord_id = ?`,
    )
    .get(guildId, discordId) as UserRow | undefined;

  if (existing) {
    if (nickname && nickname !== existing.nickname) {
      db.prepare(`UPDATE users SET nickname = ? WHERE id = ?`).run(nickname, existing.id);
      return { ...existing, nickname };
    }
    return existing;
  }

  const settings = getGuildSettings(guildId);
  const createdAt = toSqliteDatetime();
  const result = db
    .prepare(
      `INSERT INTO users (guild_id, discord_id, nickname, balance, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(guildId, discordId, nickname || 'Unknown', settings.startingBalance, createdAt);

  const userId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO transactions (guild_id, user_id, type, amount, balance_after, description)
     VALUES (?, ?, 'register', ?, ?, ?)`,
  ).run(
    guildId,
    userId,
    settings.startingBalance,
    settings.startingBalance,
    `Welcome bonus: ${settings.startingBalance} ${settings.currencyName}`,
  );

  return {
    id: userId,
    guild_id: guildId,
    discord_id: discordId,
    nickname: nickname || 'Unknown',
    balance: settings.startingBalance,
    last_daily_at: null,
    created_at: createdAt,
  };
}

export function getUserById(userId: number): UserRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, guild_id, discord_id, nickname, balance, last_daily_at, created_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as UserRow | undefined;
}

export function getUserByDiscord(guildId: string, discordId: string): UserRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, guild_id, discord_id, nickname, balance, last_daily_at, created_at
       FROM users WHERE guild_id = ? AND discord_id = ?`,
    )
    .get(guildId, discordId) as UserRow | undefined;
}
