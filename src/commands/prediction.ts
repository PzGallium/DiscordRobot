import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { listOpenPredictions } from '../services/prediction.js';
import {
  buildCreatePredictionModal,
  DURATION_PRESET_CHOICES,
  type DurationPresetValue,
  type PredictionOptionTemplate,
} from '../ui/predictionCreateModal.js';
import { buildSettlePredictionSelect } from '../ui/predictionSettlePicker.js';
import { isGuildAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('prediction')
  .setDescription('竞猜系统')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('创建竞猜并发布面板（管理员）')
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('提交后多久截止下注')
          .setRequired(true)
          .addChoices(...DURATION_PRESET_CHOICES),
      )
      .addStringOption((opt) =>
        opt
          .setName('template')
          .setDescription('选项模板')
          .setRequired(false)
          .addChoices(
            { name: 'YES / NO（默认）', value: 'yesno' },
            { name: 'A / B / C / D', value: 'abcd' },
            { name: 'A / B / C', value: 'abc' },
            { name: '自定义多选项', value: 'custom' },
          ),
      ),
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

  if (!interaction.member || !isGuildAdmin(interaction.member)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return;
  }

  try {
    if (sub === 'create') {
      const duration = interaction.options.getString('duration', true) as DurationPresetValue;
      const template = (interaction.options.getString('template') ??
        'yesno') as PredictionOptionTemplate;
      await interaction.showModal(buildCreatePredictionModal(template, duration));
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
