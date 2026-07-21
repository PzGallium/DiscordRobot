import { getDb } from '../db/index.js';

export type LeaderboardEntry = {
  rank: number;
  discord_id: string;
  nickname: string;
  balance: number;
};

export function getLeaderboard(guildId: string, limit = 10): LeaderboardEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT discord_id, nickname, balance
       FROM users
       WHERE guild_id = ?
       ORDER BY balance DESC, id ASC
       LIMIT ?`,
    )
    .all(guildId, limit) as Array<{ discord_id: string; nickname: string; balance: number }>;

  return rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));
}
