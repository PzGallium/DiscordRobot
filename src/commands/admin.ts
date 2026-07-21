import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { applyDelta, EconomyError, withTransaction } from '../services/economy.js';
import { ensureUser } from '../services/user.js';
import { formatCoins } from '../utils/format.js';
import { isGuildAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('管理员工具')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('addmoney')
      .setDescription('调整用户余额（测试用）')
      .addUserOption((opt) => opt.setName('user').setDescription('目标用户').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('加减金额（可为负）').setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.member) {
    await interaction.reply({ content: '只能在服务器里使用。', ephemeral: true });
    return;
  }

  if (!isGuildAdmin(interaction.member)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommand() !== 'addmoney') {
    await interaction.reply({ content: '未知子命令。', ephemeral: true });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const nickname = target.username;

  try {
    const result = withTransaction((db) => {
      const user = ensureUser(interaction.guildId!, target.id, nickname);
      return applyDelta({
        db,
        guildId: interaction.guildId!,
        userId: user.id,
        delta: amount,
        type: 'admin_adjust',
        description: `Admin adjust by ${interaction.user.id}: ${amount}`,
      });
    });

    await interaction.reply({
      content: `已调整 <@${target.id}>：${amount >= 0 ? '+' : ''}${formatCoins(amount)}\n余额：${formatCoins(result.balanceAfter!)}`,
      ephemeral: true,
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '调整失败';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
