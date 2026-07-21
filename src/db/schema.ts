export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  balance INTEGER NOT NULL DEFAULT 0,
  last_daily_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, discord_id)
);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  title TEXT NOT NULL,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  deadline TEXT NOT NULL,
  winner_option TEXT,
  created_by TEXT NOT NULL,
  fee_bps INTEGER NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  option TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (prediction_id) REFERENCES predictions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id INTEGER,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  ref_type TEXT,
  ref_id INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  channel_id TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS red_packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  count INTEGER NOT NULL,
  remaining_amount INTEGER NOT NULL,
  remaining_count INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS red_packet_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  red_packet_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (red_packet_id, user_id),
  FOREIGN KEY (red_packet_id) REFERENCES red_packets(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_guild_balance ON users(guild_id, balance DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_guild_status ON predictions(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_bets_prediction ON bets(prediction_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(guild_id, user_id);
`;
