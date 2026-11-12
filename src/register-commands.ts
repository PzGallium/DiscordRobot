import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import * as admin from './commands/admin.js';
import * as balance from './commands/balance.js';
import * as daily from './commands/daily.js';
import * as leaderboard from './commands/leaderboard.js';
import * as prediction from './commands/prediction.js';
import * as redpacket from './commands/redpacket.js';
import * as settings from './commands/settings.js';
import * as transfer from './commands/transfer.js';

const commands = [daily, balance, leaderboard, transfer, prediction, redpacket, admin, settings];

async function main(): Promise<void> {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log(`Registering ${body.length} global commands...`);
  await rest.put(Routes.applicationCommands(config.clientId), {
    body,
  });
  console.log('Commands registered.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
