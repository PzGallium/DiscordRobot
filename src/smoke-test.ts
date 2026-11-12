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
const { getGuildSettings, resetGuildSettings, updateGuildSettings } = await import(
  './services/guildSettings.js'
);
const { getLeaderboard } = await import('./services/leaderboard.js');
const {
  createPrediction,
  getLatestPredictionDefaults,
  placeBet,
  settlePrediction,
  getPoolTotal,
} = await import('./services/prediction.js');
const { createTransfer, acceptTransfer } = await import('./services/transfer.js');
const { createRedPacket, claimRedPacket, expireOpenRedPackets } = await import(
  './services/redpacket.js'
);
const { applyDelta, getBalance, withTransaction } = await import('./services/economy.js');
const { formatCoins } = await import('./utils/format.js');
const { fromSqliteDatetime } = await import('./utils/time.js');

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

const charlie = ensureUser(guild, 'charlie', 'Charlie');
const dana = ensureUser(guild, 'dana', 'Dana');
const splitPrediction = createPrediction({
  guildId: guild,
  title: 'Remainder test',
  options: ['YES', 'NO'],
  deadline,
  createdBy: 'admin',
  channelId: 'ch1',
});
for (const bettor of [
  { id: 'alice', name: 'Alice' },
  { id: charlie.discord_id, name: 'Charlie' },
  { id: dana.discord_id, name: 'Dana' },
]) {
  placeBet({
    predictionId: splitPrediction.id,
    guildId: guild,
    discordId: bettor.id,
    nickname: bettor.name,
    option: 'YES',
    amount: 10,
  });
}
placeBet({
  predictionId: splitPrediction.id,
  guildId: guild,
  discordId: 'bob',
  nickname: 'Bob',
  option: 'NO',
  amount: 10,
});
const splitSettled = settlePrediction(splitPrediction.id, 'YES');
console.assert(splitSettled.fee === 2, `exact fee got ${splitSettled.fee}`);
console.assert(splitSettled.distributable === 38, `distributable got ${splitSettled.distributable}`);
console.assert(
  splitSettled.winners.reduce((sum, winner) => sum + winner.payout, 0) === 38,
  'all payout remainder distributed',
);
console.assert(
  splitSettled.winners.map((winner) => winner.payout).join(',') === '13,13,12',
  'remainder follows stable winner order',
);
const latestDefaults = getLatestPredictionDefaults(guild);
console.assert(latestDefaults?.title === 'Remainder test', 'latest title default');
console.assert(latestDefaults?.options.join(',') === 'YES,NO', 'latest options default');
console.assert(latestDefaults?.durationMinutes === 1, 'latest duration default');

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

const bobBeforeExpiryRefund = getBalance(bob.id);
withTransaction((db) => {
  db.prepare(`UPDATE red_packets SET expires_at = '2000-01-01 00:00:00' WHERE id = ?`).run(packet.id);
});
const expiredPackets = expireOpenRedPackets();
console.assert(expiredPackets.length === 1, 'one red packet expired');
console.assert(
  expiredPackets[0]!.refunded === claim.packet.remaining_amount,
  'unclaimed red packet balance refunded',
);
console.assert(
  getBalance(bob.id) === bobBeforeExpiryRefund + claim.packet.remaining_amount,
  'creator received red packet refund',
);

const board = getLeaderboard(guild, 10);
console.assert(board.length >= 2, 'leaderboard');

const customGuild = 'guild2';
const custom = updateGuildSettings(
  customGuild,
  {
    currencyName: 'Gold',
    startingBalance: 2500,
    dailyReward: 275,
    transferFeeBps: 750,
    predictionFeeBps: 1250,
    redPacketExpireMs: 2 * 60 * 60 * 1000,
  },
  'owner',
);
console.assert(custom.customized, 'guild settings customized');
console.assert(getGuildSettings(guild).currencyName !== 'Gold', 'guild settings isolated');
console.assert(formatCoins(25, customGuild) === '25 Gold', 'custom currency display');

const eve = ensureUser(customGuild, 'eve', 'Eve');
console.assert(eve.balance === 2500, 'custom starting balance');
const customDaily = claimDaily(customGuild, 'eve', 'Eve');
console.assert(customDaily.ok && customDaily.reward === 275, 'custom daily reward');

const customPrediction = createPrediction({
  guildId: customGuild,
  title: 'Custom fee',
  options: ['A', 'B'],
  deadline,
  createdBy: 'owner',
  channelId: 'ch2',
});
console.assert(customPrediction.fee_bps === 1250, 'custom prediction fee snapshot');

const customTransfer = createTransfer({
  guildId: customGuild,
  fromDiscordId: 'eve',
  fromNickname: 'Eve',
  toDiscordId: 'frank',
  toNickname: 'Frank',
  amount: 100,
  channelId: 'ch2',
});
console.assert(customTransfer.transfer.fee === 7, 'custom transfer fee');
console.assert(customTransfer.transfer.fee_bps === 750, 'custom transfer fee snapshot');

const customPacketStartedAt = Date.now();
const { packet: customPacket } = createRedPacket({
  guildId: customGuild,
  creatorDiscordId: 'eve',
  creatorNickname: 'Eve',
  totalAmount: 50,
  count: 2,
  channelId: 'ch2',
});
const customPacketLifetime =
  fromSqliteDatetime(customPacket.expires_at).getTime() - customPacketStartedAt;
console.assert(
  customPacketLifetime > 2 * 60 * 60 * 1000 - 2000 &&
    customPacketLifetime <= 2 * 60 * 60 * 1000,
  'custom red packet expiry snapshot',
);

const reset = resetGuildSettings(customGuild);
console.assert(!reset.customized, 'guild settings reset');
console.assert(reset.currencyName !== 'Gold', 'reset uses environment defaults');

console.log('Smoke test passed.');
console.log(
  'Leaderboard:',
  board.map((e) => `${e.nickname}:${e.balance}`).join(', '),
);

closeDb();
