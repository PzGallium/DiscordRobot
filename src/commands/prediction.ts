import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { getLatestPredictionDefaults, listOpenPredictions } from '../services/prediction.js';
import { buildCreatePredictionModal } from '../ui/predictionCreateModal.js';
import { buildSettlePredictionSelect } from '../ui/predictionSettlePicker.js';
import { canManageBot } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('prediction')
  .setDescription('竞猜系统')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('创建竞猜并发布面板（管理员）'),
  )
  .addSubcommand((sub) =>
    sub.setName('settle').setDescription('开奖结算（管理员）'),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('列出进行中的竞猜'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    const list = listOpenPredictions(interaction.guildId);
    if (list.length === 0) {
      await interaction.reply({ content: '当前没有进行中的竞猜。', ephemeral: true });
      return;
    }

    const lines = list.map((p) => {
      const link =
        p.channel_id && p.message_id
          ? `https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.message_id}`
          : null;
      return `#${p.id} · **${p.title}** · ${p.status}${link ? ` · [打开面板](${link})` : ''}`;
    });

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  if (!interaction.member || !canManageBot(interaction.member, interaction.user.id)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return;
  }

  try {
    if (sub === 'create') {
      const defaults = getLatestPredictionDefaults(interaction.guildId);
      await interaction.showModal(buildCreatePredictionModal(defaults));
      return;
    }

    if (sub === 'settle') {
      const list = listOpenPredictions(interaction.guildId);
      if (list.length === 0) {
        await interaction.reply({ content: '当前没有可结算的竞猜。', ephemeral: true });
        return;
      }

      await interaction.reply({
        content: '请选择要结算的竞猜：',
        components: [buildSettlePredictionSelect(list)],
        ephemeral: true,
      });
    }
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '操作失败';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}
