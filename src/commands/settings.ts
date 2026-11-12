import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  getGuildSettings,
  resetGuildSettings,
  updateGuildSettings,
  type GuildSettings,
} from '../services/guildSettings.js';
import { canManageBot } from '../utils/permissions.js';

const MAX_AMOUNT = 1_000_000_000;
const MAX_EXPIRY_HOURS = 24 * 365;

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('settings')
  .setDescription('Configure this server economy')
  .addSubcommand((sub) =>
    sub.setName('view').setDescription('View this server economy settings'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('currency')
      .setDescription('Set the currency display name')
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Currency name, for example Coin or Gold')
          .setMinLength(1)
          .setMaxLength(32)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('starting-balance')
      .setDescription('Set the balance for future new users')
      .addIntegerOption((opt) =>
        opt
          .setName('amount')
          .setDescription('Starting balance')
          .setMinValue(0)
          .setMaxValue(MAX_AMOUNT)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('daily-reward')
      .setDescription('Set the daily claim reward')
      .addIntegerOption((opt) =>
        opt
          .setName('amount')
          .setDescription('Daily reward')
          .setMinValue(0)
          .setMaxValue(MAX_AMOUNT)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('prediction-fee')
      .setDescription('Set the fee for new predictions')
      .addNumberOption((opt) =>
        opt
          .setName('percent')
          .setDescription('Fee percentage from 0 to 100')
          .setMinValue(0)
          .setMaxValue(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('transfer-fee')
      .setDescription('Set the fee for new transfers')
      .addNumberOption((opt) =>
        opt
          .setName('percent')
          .setDescription('Fee percentage from 0 to 100')
          .setMinValue(0)
          .setMaxValue(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('redpacket-expiry')
      .setDescription('Set the expiry time for new red packets')
      .addIntegerOption((opt) =>
        opt
          .setName('hours')
          .setDescription('Expiry time in hours')
          .setMinValue(1)
          .setMaxValue(MAX_EXPIRY_HOURS)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('reset').setDescription('Reset this server to environment defaults'),
  );

function formatPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function formatSettings(settings: GuildSettings): string {
  const source = settings.customized ? 'Server override' : 'Environment defaults';
  return [
    `**Economy settings — ${source}**`,
    `Currency: **${settings.currencyName}**`,
    `Starting balance: **${settings.startingBalance}**`,
    `Daily reward: **${settings.dailyReward}**`,
    `Prediction fee: **${formatPercent(settings.predictionFeeBps)}**`,
    `Transfer fee: **${formatPercent(settings.transferFeeBps)}**`,
    `Red packet expiry: **${settings.redPacketExpireMs / 3_600_000} hours**`,
  ].join('\n');
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.member) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  if (!canManageBot(interaction.member, interaction.user.id)) {
    await interaction.reply({
      content: 'You need Manage Server or Administrator permission.',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  let settings: GuildSettings;

  switch (subcommand) {
    case 'view':
      settings = getGuildSettings(guildId);
      break;
    case 'currency': {
      const currencyName = interaction.options.getString('name', true).trim();
      if (!currencyName) {
        await interaction.reply({ content: 'Currency name cannot be empty.', ephemeral: true });
        return;
      }
      settings = updateGuildSettings(guildId, { currencyName }, interaction.user.id);
      break;
    }
    case 'starting-balance':
      settings = updateGuildSettings(
        guildId,
        { startingBalance: interaction.options.getInteger('amount', true) },
        interaction.user.id,
      );
      break;
    case 'daily-reward':
      settings = updateGuildSettings(
        guildId,
        { dailyReward: interaction.options.getInteger('amount', true) },
        interaction.user.id,
      );
      break;
    case 'prediction-fee':
      settings = updateGuildSettings(
        guildId,
        { predictionFeeBps: Math.round(interaction.options.getNumber('percent', true) * 100) },
        interaction.user.id,
      );
      break;
    case 'transfer-fee':
      settings = updateGuildSettings(
        guildId,
        { transferFeeBps: Math.round(interaction.options.getNumber('percent', true) * 100) },
        interaction.user.id,
      );
      break;
    case 'redpacket-expiry':
      settings = updateGuildSettings(
        guildId,
        { redPacketExpireMs: interaction.options.getInteger('hours', true) * 3_600_000 },
        interaction.user.id,
      );
      break;
    case 'reset':
      settings = resetGuildSettings(guildId);
      break;
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
      return;
  }

  const prefix = subcommand === 'view' ? '' : subcommand === 'reset' ? 'Settings reset.\n\n' : 'Settings updated.\n\n';
  await interaction.reply({ content: `${prefix}${formatSettings(settings)}`, ephemeral: true });
}
