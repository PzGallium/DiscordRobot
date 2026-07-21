import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Env ${name} must be an integer, got: ${raw}`);
  }
  return n;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  currencyName: process.env.CURRENCY_NAME ?? 'Pz Coin',
  startingBalance: intEnv('STARTING_BALANCE', 1000),
  dailyReward: intEnv('DAILY_REWARD', 100),
  /** Transfer fee in basis points (200 = 2%) */
  transferFeeBps: intEnv('TRANSFER_FEE_BPS', 200),
  /** Prediction pool fee in basis points (500 = 5%) */
  predictionFeeBps: intEnv('PREDICTION_FEE_BPS', 500),
  transferExpireMs: intEnv('TRANSFER_EXPIRE_MS', 5 * 60 * 1000),
  dailyTimezone: process.env.DAILY_TIMEZONE ?? 'America/New_York',
  dbPath: process.env.DB_PATH ?? 'data/pzcoin.db',
} as const;
