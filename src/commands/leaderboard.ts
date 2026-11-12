import {
  ApplicationIntegrationType,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getLeaderboard } from '../services/leaderboard.js';
import { formatCoins } from '../utils/format.js';

const MEDALS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('leaderboard')
  .setDescription('查看 Pz Coin Top 10');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: '只能在服务器里使用。', ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const entries = getLeaderboard(guildId, 10);
  if (entries.length === 0) {
    await interaction.reply({ content: '暂无排行数据。先 `/daily` 或互动一次吧！', ephemeral: true });
    return;
  }

  const lines = entries.map((e) => {
    const medal = MEDALS[e.rank - 1] ?? `${e.rank}.`;
    return `${medal} <@${e.discord_id}> — **${formatCoins(e.balance, guildId)}**`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Top 10')
    .setColor(0xfee75c)
    .setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed] });
}
