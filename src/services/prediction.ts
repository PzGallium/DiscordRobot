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

export type PredictionCreateDefaults = {
  title: string;
  options: string[];
  durationMinutes: number;
};

export function parseOptions(optionsJson: string): string[] {
  return JSON.parse(optionsJson) as string[];
}

export function getPrediction(id: number): PredictionRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM predictions WHERE id = ?`)
    .get(id) as PredictionRow | undefined;
}

export function getLatestPredictionDefaults(
  guildId: string,
): PredictionCreateDefaults | undefined {
  const latest = getDb()
    .prepare(`SELECT * FROM predictions WHERE guild_id = ? ORDER BY id DESC LIMIT 1`)
    .get(guildId) as PredictionRow | undefined;
  if (!latest) return undefined;

  const durationMs =
    fromSqliteDatetime(latest.deadline).getTime() -
    fromSqliteDatetime(latest.created_at).getTime();

  return {
    title: latest.title,
    options: parseOptions(latest.options_json),
    durationMinutes: Math.max(1, Math.round(durationMs / 60_000)),
  };
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

export const PREDICTION_CANCEL_KEYWORDS = new Set([
  'CANCEL',
  'cancel',
  'VOID',
  'void',
  '退款',
  '取消',
  '无人猜中',
]);

export const PREDICTION_CANCELLED_MARKER = 'CANCELLED';

export function isCancelSettleInput(raw: string): boolean {
  return PREDICTION_CANCEL_KEYWORDS.has(raw.trim());
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
  /** payout = normal settle; refund = void / nobody hit → all coins returned */
  mode: 'payout' | 'refund';
};

function buildOptionTotals(options: string[], bets: BetRow[]): Record<string, number> {
  const optionTotals: Record<string, number> = {};
  for (const opt of options) optionTotals[opt] = 0;
  for (const bet of bets) {
    optionTotals[bet.option] = (optionTotals[bet.option] ?? 0) + bet.amount;
  }
  return optionTotals;
}

function refundAllBets(input: {
  db: ReturnType<typeof getDb>;
  guildId: string;
  predictionId: number;
  bets: BetRow[];
}): SettleParticipant[] {
  const refunded: SettleParticipant[] = [];
  for (const bet of input.bets) {
    const user = getUserById(bet.user_id);
    if (!user) throw new EconomyError('User not found');

    applyDelta({
      db: input.db,
      guildId: input.guildId,
      userId: user.id,
      delta: bet.amount,
      type: 'bet_refund',
      refType: 'prediction',
      refId: input.predictionId,
      description: `Refund ${bet.amount} on cancelled #${input.predictionId}`,
    });

    refunded.push({
      userId: user.id,
      discordId: user.discord_id,
      nickname: user.nickname,
      option: bet.option,
      bet: bet.amount,
      payout: bet.amount,
    });
  }
  return refunded;
}

export function settlePrediction(predictionId: number, winnerOptionRaw: string): SettleResult {
  return withTransaction((db) => {
    const prediction = db
      .prepare(`SELECT * FROM predictions WHERE id = ?`)
      .get(predictionId) as PredictionRow | undefined;

    if (!prediction) throw new EconomyError('Prediction not found');
    if (prediction.status === 'settled') throw new EconomyError('Already settled');

    const options = parseOptions(prediction.options_json);
    const bets = db
      .prepare(`SELECT * FROM bets WHERE prediction_id = ?`)
      .all(predictionId) as BetRow[];
    const optionTotals = buildOptionTotals(options, bets);
    const pool = bets.reduce((sum, b) => sum + b.amount, 0);

    // Explicit cancel / void → full refund
    if (isCancelSettleInput(winnerOptionRaw)) {
      const refunded = refundAllBets({
        db,
        guildId: prediction.guild_id,
        predictionId: prediction.id,
        bets,
      });

      db.prepare(
        `UPDATE predictions SET status = 'settled', winner_option = ? WHERE id = ?`,
      ).run(PREDICTION_CANCELLED_MARKER, prediction.id);

      return {
        prediction: getPrediction(prediction.id)!,
        pool,
        fee: 0,
        distributable: pool,
        winnerOption: PREDICTION_CANCELLED_MARKER,
        optionTotals,
        winners: refunded,
        losers: [],
        mode: 'refund',
      };
    }

    if (!options.includes(winnerOptionRaw)) {
      throw new EconomyError(
        `无效获胜选项。请填写：${options.join(' / ')}，或填「退款」取消并全额退回`,
      );
    }

    const fee = Math.floor((pool * prediction.fee_bps) / 10000);
    const distributable = pool - fee;
    const winningBets = bets.filter((b) => b.option === winnerOptionRaw);
    const losingBets = bets.filter((b) => b.option !== winnerOptionRaw);
    const winningTotal = winningBets.reduce((sum, b) => sum + b.amount, 0);

    // Nobody hit the winning option → cancel & refund everyone
    if (winningTotal === 0) {
      const refunded = refundAllBets({
        db,
        guildId: prediction.guild_id,
        predictionId: prediction.id,
        bets,
      });

      db.prepare(
        `UPDATE predictions SET status = 'settled', winner_option = ? WHERE id = ?`,
      ).run(PREDICTION_CANCELLED_MARKER, prediction.id);

      return {
        prediction: getPrediction(prediction.id)!,
        pool,
        fee: 0,
        distributable: pool,
        winnerOption: PREDICTION_CANCELLED_MARKER,
        optionTotals,
        winners: refunded,
        losers: [],
        mode: 'refund',
      };
    }

    const winners: SettleParticipant[] = [];
    const losers: SettleParticipant[] = [];
    const payouts = winningBets.map((bet) => ({
      bet,
      payout: Math.floor((distributable * bet.amount) / winningTotal),
    }));
    let remainder = distributable - payouts.reduce((sum, item) => sum + item.payout, 0);
    const remainderOrder = [...payouts].sort(
      (a, b) => b.bet.amount - a.bet.amount || a.bet.id - b.bet.id,
    );
    for (const item of remainderOrder) {
      if (remainder <= 0) break;
      item.payout += 1;
      remainder -= 1;
    }

    let paid = 0;
    for (const { bet, payout } of payouts) {
      const user = getUserById(bet.user_id);
      if (!user) throw new EconomyError('User not found');

      if (payout > 0) {
        applyDelta({
          db,
          guildId: prediction.guild_id,
          userId: user.id,
          delta: payout,
          type: 'bet_win',
          refType: 'prediction',
          refId: prediction.id,
          description: `Won ${payout} on #${prediction.id} (${winnerOptionRaw})`,
        });
      }
      paid += payout;

      winners.push({
        userId: user.id,
        discordId: user.discord_id,
        nickname: user.nickname,
        option: bet.option,
        bet: bet.amount,
        payout,
      });
    }

    for (const bet of losingBets) {
      const user = getUserById(bet.user_id);
      if (!user) throw new EconomyError('User not found');
      losers.push({
        userId: user.id,
        discordId: user.discord_id,
        nickname: user.nickname,
        option: bet.option,
        bet: bet.amount,
        payout: 0,
      });
    }

    if (paid !== distributable) {
      throw new EconomyError('Payout allocation mismatch');
    }

    if (fee > 0) {
      applyDelta({
        db,
        guildId: prediction.guild_id,
        userId: null,
        delta: -fee,
        type: 'fee_burn',
        refType: 'prediction',
        refId: prediction.id,
        description: `Prediction #${prediction.id} fee burn ${fee}`,
      });
    }

    db.prepare(
      `UPDATE predictions SET status = 'settled', winner_option = ? WHERE id = ?`,
    ).run(winnerOptionRaw, prediction.id);

    return {
      prediction: getPrediction(prediction.id)!,
      pool,
      fee,
      distributable,
      winnerOption: winnerOptionRaw,
      optionTotals,
      winners,
      losers,
      mode: 'payout',
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
