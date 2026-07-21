/**
 * Local smoke test for economy services (no Discord connection).
 * Run: DISCORD_TOKEN=x CLIENT_ID=x GUILD_ID=x DB_PATH=data/smoke.db npx tsx src/smoke-test.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

process.env.DISCORD_TOKEN ??= 'x';
process.env.CLIENT_ID ??= 'x';
process.env.GUILD_ID ??= 'x';
process.env.DB_PATH = 'data/smoke.db';

const dbFile = path.join(process.cwd(), 'data/smoke.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
  try {
    fs.unlinkSync(f);
  } catch {
    // ignore
  }
}

const { closeDb } = await import('./db/index.js');
const { ensureUser } = await import('./services/user.js');
const { claimDaily } = await import('./services/daily.js');
const { getLeaderboard } = await import('./services/leaderboard.js');
const { createPrediction, placeBet, settlePrediction, getPoolTotal } = await import(
  './services/prediction.js'
);
const { createTransfer, acceptTransfer } = await import('./services/transfer.js');
const { createRedPacket, claimRedPacket } = await import('./services/redpacket.js');
const { applyDelta, withTransaction } = await import('./services/economy.js');

const guild = 'guild1';

const alice = ensureUser(guild, 'alice', 'Alice');
console.assert(alice.balance === 1000, 'register bonus');

const daily1 = claimDaily(guild, 'alice', 'Alice');
console.assert(daily1.ok && daily1.balance === 1100, 'daily reward');
const daily2 = claimDaily(guild, 'alice', 'Alice');
console.assert(!daily2.ok, 'daily once per day');

const deadline = new Date(Date.now() + 60_000);
const pred = createPrediction({
  guildId: guild,
  title: 'Test',
  options: ['YES', 'NO'],
  deadline,
  createdBy: 'admin',
  channelId: 'ch1',
});

placeBet({
  predictionId: pred.id,
  guildId: guild,
  discordId: 'alice',
  nickname: 'Alice',
  option: 'YES',
  amount: 100,
});
placeBet({
  predictionId: pred.id,
  guildId: guild,
  discordId: 'bob',
  nickname: 'Bob',
  option: 'NO',
  amount: 300,
});
console.assert(getPoolTotal(pred.id) === 400, 'pool');

const settled = settlePrediction(pred.id, 'YES');
console.assert(settled.winners.length === 1, 'one winner');
console.assert(settled.winners[0]!.payout === 380, `payout got ${settled.winners[0]!.payout}`); // 400 - 5% = 380

const bob = ensureUser(guild, 'bob', 'Bob');
withTransaction((db) => {
  applyDelta({
    db,
    guildId: guild,
    userId: bob.id,
    delta: 5000,
    type: 'admin_adjust',
    description: 'test topup',
  });
});

const t = createTransfer({
  guildId: guild,
  fromDiscordId: 'bob',
  fromNickname: 'Bob',
  toDiscordId: 'alice',
  toNickname: 'Alice',
  amount: 100,
  channelId: 'ch1',
});
console.assert(t.totalDebit === 102, `fee debit ${t.totalDebit}`);
acceptTransfer(t.transfer.id, 'alice');

const { packet } = createRedPacket({
  guildId: guild,
  creatorDiscordId: 'bob',
  creatorNickname: 'Bob',
  totalAmount: 100,
  count: 2,
  channelId: 'ch1',
});
const claim = claimRedPacket({
  packetId: packet.id,
  guildId: guild,
  discordId: 'alice',
  nickname: 'Alice',
});
console.assert(claim.amount > 0, 'claim > 0');

const board = getLeaderboard(guild, 10);
console.assert(board.length >= 2, 'leaderboard');

console.log('Smoke test passed.');
console.log(
  'Leaderboard:',
  board.map((e) => `${e.nickname}:${e.balance}`).join(', '),
);

closeDb();
