import { config } from '../config.js';
import { getDb } from '../db/index.js';

export type GuildSettings = {
  guildId: string;
  currencyName: string;
  startingBalance: number;
  dailyReward: number;
  transferFeeBps: number;
  predictionFeeBps: number;
  redPacketExpireMs: number;
  customized: boolean;
};

export type GuildSettingsPatch = Partial<
  Pick<
    GuildSettings,
    | 'currencyName'
    | 'startingBalance'
    | 'dailyReward'
    | 'transferFeeBps'
    | 'predictionFeeBps'
    | 'redPacketExpireMs'
  >
>;

type GuildSettingsRow = {
  guild_id: string;
  currency_name: string;
  starting_balance: number;
  daily_reward: number;
  transfer_fee_bps: number;
  prediction_fee_bps: number;
  redpacket_expire_ms: number;
};

function defaults(guildId: string): GuildSettings {
  return {
    guildId,
    currencyName: config.currencyName,
    startingBalance: config.startingBalance,
    dailyReward: config.dailyReward,
    transferFeeBps: config.transferFeeBps,
    predictionFeeBps: config.predictionFeeBps,
    redPacketExpireMs: config.redPacketExpireMs,
    customized: false,
  };
}

function fromRow(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    currencyName: row.currency_name,
    startingBalance: row.starting_balance,
    dailyReward: row.daily_reward,
    transferFeeBps: row.transfer_fee_bps,
    predictionFeeBps: row.prediction_fee_bps,
    redPacketExpireMs: row.redpacket_expire_ms,
    customized: true,
  };
}

export function getGuildSettings(guildId: string): GuildSettings {
  const row = getDb()
    .prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`)
    .get(guildId) as GuildSettingsRow | undefined;
  return row ? fromRow(row) : defaults(guildId);
}

export function updateGuildSettings(
  guildId: string,
  patch: GuildSettingsPatch,
  updatedBy: string,
): GuildSettings {
  const current = getGuildSettings(guildId);
  const next = { ...current, ...patch };

  getDb()
    .prepare(
      `INSERT INTO guild_settings
       (guild_id, currency_name, starting_balance, daily_reward, transfer_fee_bps,
        prediction_fee_bps, redpacket_expire_ms, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         currency_name = excluded.currency_name,
         starting_balance = excluded.starting_balance,
         daily_reward = excluded.daily_reward,
         transfer_fee_bps = excluded.transfer_fee_bps,
         prediction_fee_bps = excluded.prediction_fee_bps,
         redpacket_expire_ms = excluded.redpacket_expire_ms,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .run(
      guildId,
      next.currencyName,
      next.startingBalance,
      next.dailyReward,
      next.transferFeeBps,
      next.predictionFeeBps,
      next.redPacketExpireMs,
      updatedBy,
    );

  return getGuildSettings(guildId);
}

export function resetGuildSettings(guildId: string): GuildSettings {
  getDb().prepare(`DELETE FROM guild_settings WHERE guild_id = ?`).run(guildId);
  return getGuildSettings(guildId);
}
