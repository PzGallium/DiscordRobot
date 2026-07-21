import 'dotenv/config';
import { Events } from 'discord.js';
import { createClient, type SlashCommand } from './client.js';
import * as admin from './commands/admin.js';
import * as balance from './commands/balance.js';
import * as daily from './commands/daily.js';
import * as leaderboard from './commands/leaderboard.js';
import * as predictionCmd from './commands/prediction.js';
import * as redpacket from './commands/redpacket.js';
import * as transferCmd from './commands/transfer.js';
import { config } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { handleComponentInteraction } from './interactions/index.js';
import { closeExpiredPredictions, getPrediction } from './services/prediction.js';
import { expirePendingTransfers } from './services/transfer.js';
import { getUserById } from './services/user.js';
import { buildPredictionButtons, buildPredictionEmbed } from './ui/predictionPanel.js';
import { buildTransferButtons, buildTransferEmbed } from './ui/transferButtons.js';

const commandModules: SlashCommand[] = [
  daily,
  balance,
  leaderboard,
  transferCmd,
  predictionCmd,
  redpacket,
  admin,
];

async function refreshClosedPredictionPanels(client: ReturnType<typeof createClient>): Promise<void> {
  const closed = closeExpiredPredictions();
  for (const p of closed) {
    if (!p.channel_id || !p.message_id) continue;
    try {
      const channel = await client.channels.fetch(p.channel_id);
      if (!channel || !channel.isTextBased() || !('messages' in channel)) continue;
      const msg = await channel.messages.fetch(p.message_id);
      const fresh = getPrediction(p.id)!;
      await msg.edit({
        embeds: [buildPredictionEmbed(fresh)],
        components: buildPredictionButtons(fresh),
      });
    } catch {
      // ignore
    }
  }
}

async function refreshExpiredTransfers(client: ReturnType<typeof createClient>): Promise<void> {
  const expired = expirePendingTransfers();
  for (const t of expired) {
    if (!t.channel_id || !t.message_id) continue;
    try {
      const channel = await client.channels.fetch(t.channel_id);
      if (!channel || !channel.isTextBased() || !('messages' in channel)) continue;
      const msg = await channel.messages.fetch(t.message_id);
      const from = getUserById(t.from_user_id);
      const to = getUserById(t.to_user_id);
      if (!from || !to) continue;
      await msg.edit({
        embeds: [
          buildTransferEmbed({
            transfer: t,
            from,
            to,
            statusNote: '⏰ 已超时，资金已退回转出方。',
          }),
        ],
        components: [buildTransferButtons(t.id, true)],
      });
    } catch {
      // ignore
    }
  }
}

async function main(): Promise<void> {
  getDb();
  const client = createClient();

  for (const cmd of commandModules) {
    client.commands.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Currency: ${config.currencyName} · DB: ${config.dbPath}`);

    void refreshClosedPredictionPanels(client);
    void refreshExpiredTransfers(client);

    setInterval(() => {
      void refreshClosedPredictionPanels(client);
      void refreshExpiredTransfers(client);
    }, 30_000);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (await handleComponentInteraction(interaction)) return;

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } catch (err) {
      console.error('Interaction error:', err);
      const payload = {
        content: '处理命令时出错了，请稍后再试。',
        ephemeral: true,
      };
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => undefined);
        } else {
          await interaction.reply(payload).catch(() => undefined);
        }
      }
    }
  });

  const shutdown = () => {
    console.log('Shutting down...');
    client.destroy();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await client.login(config.token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
