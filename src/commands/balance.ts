import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { ensureUser } from '../services/user.js';
import { formatCoins } from '../utils/format.js';

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('balance')
  .setDescription('查询你的 Pz Coin 余额');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: '只能在服务器里使用。', ephemeral: true });
    return;
  }

  const nickname =
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  const user = ensureUser(interaction.guildId, interaction.user.id, nickname);
  await interaction.reply({
    content: `余额：\n**${formatCoins(user.balance, interaction.guildId)}**`,
    ephemeral: true,
  });
}
