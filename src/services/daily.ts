import { calendarDateInTimezone } from '../utils/time.js';
import { applyDelta, withTransaction } from './economy.js';
import { getGuildSettings } from './guildSettings.js';
import { ensureUser, type UserRow } from './user.js';

export type DailyResult =
  | { ok: true; reward: number; balance: number; user: UserRow }
  | { ok: false; reason: 'already_claimed'; balance: number; user: UserRow };

export function claimDaily(guildId: string, discordId: string, nickname: string): DailyResult {
  return withTransaction((db) => {
    const user = ensureUser(guildId, discordId, nickname);
    const settings = getGuildSettings(guildId);
    const today = calendarDateInTimezone();

    if (user.last_daily_at === today) {
      return { ok: false, reason: 'already_claimed', balance: user.balance, user };
    }

    const { balanceAfter, user: updated } = applyDelta({
      db,
      guildId,
      userId: user.id,
      delta: settings.dailyReward,
      type: 'daily',
      description: `Daily check-in +${settings.dailyReward}`,
    });

    db.prepare(`UPDATE users SET last_daily_at = ? WHERE id = ?`).run(today, user.id);

    return {
      ok: true,
      reward: settings.dailyReward,
      balance: balanceAfter!,
      user: { ...updated!, last_daily_at: today },
    };
  });
}
