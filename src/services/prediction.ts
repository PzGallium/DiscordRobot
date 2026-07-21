import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { fromSqliteDatetime, toSqliteDatetime } from '../utils/time.js';
import { applyDelta, EconomyError, withTransaction } from './economy.js';
import { ensureUser, getUserById, type UserRow } from './user.js';

export type PredictionStatus = 'open' | 'closed' | 'settled';

export type PredictionRow = {
  id: number;
  guild_id: string;
  title: string;
  options_json: string;
  status: PredictionStatus;
  deadline: string;
  winner_option: string | null;
  created_by: string;
  fee_bps: number;
  channel_id: string | null;
  message_id: string | null;
  created_at: string;
};

export type BetRow = {
  id: number;
  prediction_id: number;
  user_id: number;
  option: string;
  amount: number;
  created_at: string;
};

export function parseOptions(optionsJson: string): string[] {
  return JSON.parse(optionsJson) as string[];
}

export function getPrediction(id: number): PredictionRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM predictions WHERE id = ?`)
    .get(id) as PredictionRow | undefined;
}

export function listOpenPredictions(guildId: string): PredictionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM predictions
       WHERE guild_id = ? AND status IN ('open', 'closed')
       ORDER BY id DESC
       LIMIT 20`,
    )
    .all(guildId) as PredictionRow[];
}

export function createPrediction(input: {
  guildId: string;
  title: string;
  options: string[];
  deadline: Date;
  createdBy: string;
  channelId: string;
}): PredictionRow {
  if (input.options.length < 2 || input.options.length > 5) {
    throw new EconomyError('Options must be between 2 and 5');
  }
  if (input.deadline.getTime() <= Date.now()) {
    throw new EconomyError('Deadline must be in the future');
  }

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO predictions
       (guild_id, title, options_json, status, deadline, created_by, fee_bps, channel_id)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
    )
    .run(
      input.guildId,
      input.title,
      JSON.stringify(input.options),
      toSqliteDatetime(input.deadline),
      input.createdBy,
      config.predictionFeeBps,
      input.channelId,
    );

  return getPrediction(Number(result.lastInsertRowid))!;
}

export function setPredictionMessage(predictionId: number, messageId: string): void {
  getDb()
    .prepare(`UPDATE predictions SET message_id = ? WHERE id = ?`)
    .run(messageId, predictionId);
}

export function getOptionTotals(predictionId: number): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT option, SUM(amount) AS total
       FROM bets WHERE prediction_id = ?
       GROUP BY option`,
    )
    .all(predictionId) as Array<{ option: string; total: number }>;

  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.option] = row.total;
  }
  return totals;
}

export function getPoolTotal(predictionId: number): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM bets WHERE prediction_id = ?`)
    .get(predictionId) as { total: number };
  return row.total;
}

export function isBettingOpen(prediction: PredictionRow): boolean {
  if (prediction.status !== 'open') return false;
  return fromSqliteDatetime(prediction.deadline).getTime() > Date.now();
}

export function placeBet(input: {
  predictionId: number;
  guildId: string;
  discordId: string;
  nickname: string;
  option: string;
  amount: number;
}): { user: UserRow; prediction: PredictionRow; option: string; amount: number; balance: number } {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new EconomyError('Amount must be a positive integer');
  }

  return withTransaction((db) => {
    const prediction = db
      .prepare(`SELECT * FROM predictions WHERE id = ?`)
      .get(input.predictionId) as PredictionRow | undefined;

    if (!prediction || prediction.guild_id !== input.guildId) {
      throw new EconomyError('Prediction not found');
    }
    if (!isBettingOpen(prediction)) {
      throw new EconomyError('Betting is closed for this prediction');
    }

    const options = parseOptions(prediction.options_json);
    if (!options.includes(input.option)) {
      throw new EconomyError('Invalid option');
    }

    const user = ensureUser(input.guildId, input.discordId, input.nickname);

    const existing = db
      .prepare(`SELECT * FROM bets WHERE prediction_id = ? AND user_id = ?`)
      .get(prediction.id, user.id) as BetRow | undefined;

    if (existing && existing.option !== input.option) {
      throw new EconomyError(`You already bet on ${existing.option}. Same-side only.`);
    }

    applyDelta({
      db,
      guildId: input.guildId,
      userId: user.id,
      delta: -input.amount,
      type: 'bet',
      refType: 'prediction',
      refId: prediction.id,
      description: `Bet ${input.amount} on ${input.option} (#${prediction.id})`,
    });

    if (existing) {
      db.prepare(`UPDATE bets SET amount = amount + ? WHERE id = ?`).run(input.amount, existing.id);
    } else {
      db.prepare(
        `INSERT INTO bets (prediction_id, user_id, option, amount) VALUES (?, ?, ?, ?)`,
      ).run(prediction.id, user.id, input.option, input.amount);
    }

    const refreshed = getUserById(user.id)!;
    return {
      user: refreshed,
      prediction,
      option: input.option,
      amount: input.amount,
      balance: refreshed.balance,
    };
  });
}

export type SettleParticipant = {
  userId: number;
  discordId: string;
  nickname: string;
  option: string;
  bet: number;
  payout: number;
};

export type SettleResult = {
  prediction: PredictionRow;
  pool: number;
  fee: number;
  distributable: number;
  winnerOption: string;
  optionTotals: Record<string, number>;
  winners: SettleParticipant[];
  losers: SettleParticipant[];
};

export function settlePrediction(predictionId: number, winnerOption: string): SettleResult {
  return withTransaction((db) => {
    const prediction = db
      .prepare(`SELECT * FROM predictions WHERE id = ?`)
      .get(predictionId) as PredictionRow | undefined;

    if (!prediction) throw new EconomyError('Prediction not found');
    if (prediction.status === 'settled') throw new EconomyError('Already settled');

    const options = parseOptions(prediction.options_json);
    if (!options.includes(winnerOption)) {
      throw new EconomyError('Invalid winner option');
    }

    const bets = db
      .prepare(`SELECT * FROM bets WHERE prediction_id = ?`)
      .all(predictionId) as BetRow[];

    const optionTotals: Record<string, number> = {};
    for (const opt of options) optionTotals[opt] = 0;
    for (const bet of bets) {
      optionTotals[bet.option] = (optionTotals[bet.option] ?? 0) + bet.amount;
    }

    const pool = bets.reduce((sum, b) => sum + b.amount, 0);
    const fee = Math.floor((pool * prediction.fee_bps) / 10000);
    const distributable = pool - fee;
    const winningBets = bets.filter((b) => b.option === winnerOption);
    const losingBets = bets.filter((b) => b.option !== winnerOption);
    const winningTotal = winningBets.reduce((sum, b) => sum + b.amount, 0);

    const winners: SettleParticipant[] = [];
    const losers: SettleParticipant[] = [];
    let paid = 0;

    if (winningTotal > 0 && distributable > 0) {
      for (const bet of winningBets) {
        const payout = Math.floor((distributable * bet.amount) / winningTotal);
        paid += payout;
        const user = getUserById(bet.user_id);
        if (!user) continue;

        if (payout > 0) {
          applyDelta({
            db,
            guildId: prediction.guild_id,
            userId: user.id,
            delta: payout,
            type: 'bet_win',
            refType: 'prediction',
            refId: prediction.id,
            description: `Won ${payout} on #${prediction.id} (${winnerOption})`,
          });
        }

        winners.push({
          userId: user.id,
          discordId: user.discord_id,
          nickname: user.nickname,
          option: bet.option,
          bet: bet.amount,
          payout,
        });
      }
    } else {
      for (const bet of winningBets) {
        const user = getUserById(bet.user_id);
        if (!user) continue;
        winners.push({
          userId: user.id,
          discordId: user.discord_id,
          nickname: user.nickname,
          option: bet.option,
          bet: bet.amount,
          payout: 0,
        });
      }
    }

    for (const bet of losingBets) {
      const user = getUserById(bet.user_id);
      if (!user) continue;
      losers.push({
        userId: user.id,
        discordId: user.discord_id,
        nickname: user.nickname,
        option: bet.option,
        bet: bet.amount,
        payout: 0,
      });
    }

    // fee + rounding dust (and entire pool when nobody won)
    const burnTotal = pool - paid;

    if (burnTotal > 0) {
      applyDelta({
        db,
        guildId: prediction.guild_id,
        userId: null,
        delta: -burnTotal,
        type: 'fee_burn',
        refType: 'prediction',
        refId: prediction.id,
        description: `Prediction #${prediction.id} fee/dust burn ${burnTotal}`,
      });
    }

    db.prepare(
      `UPDATE predictions SET status = 'settled', winner_option = ? WHERE id = ?`,
    ).run(winnerOption, prediction.id);

    const updated = getPrediction(prediction.id)!;
    return {
      prediction: updated,
      pool,
      fee: burnTotal,
      distributable: paid,
      winnerOption,
      optionTotals,
      winners,
      losers,
    };
  });
}

export function closeExpiredPredictions(): PredictionRow[] {
  const db = getDb();
  const now = toSqliteDatetime();
  const expired = db
    .prepare(
      `SELECT * FROM predictions
       WHERE status = 'open' AND deadline <= ?`,
    )
    .all(now) as PredictionRow[];

  if (expired.length === 0) return [];

  const ids = expired.map((p) => p.id);
  db.prepare(
    `UPDATE predictions SET status = 'closed' WHERE status = 'open' AND deadline <= ?`,
  ).run(now);

  return ids.map((id) => getPrediction(id)!).filter(Boolean);
}
