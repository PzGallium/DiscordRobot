import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.isAbsolute(config.dbPath)
    ? config.dbPath
    : path.join(process.cwd(), config.dbPath);

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  const redPacketColumns = db.pragma('table_info(red_packets)') as Array<{ name: string }>;
  if (!redPacketColumns.some((column) => column.name === 'expires_at')) {
    db.exec(`ALTER TABLE red_packets ADD COLUMN expires_at TEXT`);
  }
  const transferColumns = db.pragma('table_info(transfers)') as Array<{ name: string }>;
  if (!transferColumns.some((column) => column.name === 'fee_bps')) {
    db.exec(`ALTER TABLE transfers ADD COLUMN fee_bps INTEGER`);
  }
  db.exec(`
    UPDATE red_packets
    SET expires_at = datetime(created_at, '+24 hours')
    WHERE expires_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_red_packets_expiry
    ON red_packets(status, expires_at);
  `);
  db.prepare(`UPDATE transfers SET fee_bps = ? WHERE fee_bps IS NULL`).run(config.transferFeeBps);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
