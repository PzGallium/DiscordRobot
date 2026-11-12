import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { claimDaily } from '../services/daily.js';
import { formatCoins } from '../utils/format.js';

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('daily')
  .setDescription('每日签到领取 Pz Coin');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: '只能在服务器里使用。', ephemeral: true });
    return;
  }

  const result = claimDaily(
    interaction.guildId,
    interaction.user.id,
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username,
  );

  if (!result.ok) {
    await interaction.reply({
      content: `今天已经签到过了。当前余额：${formatCoins(result.balance, interaction.guildId)}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `签到成功！+${formatCoins(result.reward, interaction.guildId)}\n余额：${formatCoins(result.balance, interaction.guildId)}`,
    ephemeral: true,
  });
}
