import {
  ChannelType,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { createPrediction, setPredictionMessage } from '../services/prediction.js';
import {
  buildCreatePredictionModal,
  PREDICTION_CREATE_MODAL_ID,
} from '../ui/predictionCreateModal.js';
import { buildPredictionButtons, buildPredictionEmbed } from '../ui/predictionPanel.js';
import { canManageBot } from '../utils/permissions.js';

export { buildCreatePredictionModal };

export async function handlePredictionCreateModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== PREDICTION_CREATE_MODAL_ID) return false;

  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return true;
  }

  if (!interaction.member || !canManageBot(interaction.member, interaction.user.id)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return true;
  }

  if (
    interaction.channel.type !== ChannelType.GuildText &&
    interaction.channel.type !== ChannelType.GuildAnnouncement
  ) {
    await interaction.reply({ content: '请在文字频道中创建。', ephemeral: true });
    return true;
  }

  const title = interaction.fields.getTextInputValue('title').trim();
  const optionsRaw = interaction.fields.getTextInputValue('options');
  const options = optionsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const minutesRaw = interaction.fields.getTextInputValue('minutes').trim();
  const minutes = /^\d+$/.test(minutesRaw) ? Number.parseInt(minutesRaw, 10) : 0;

  if (minutes <= 0) {
    await interaction.reply({
      content: '开放时间必须填写大于 0 的整数分钟。',
      ephemeral: true,
    });
    return true;
  }
  const maxMinutes = 30 * 24 * 60;
  if (minutes > maxMinutes) {
    await interaction.reply({ content: '截止时长最长 30 天。', ephemeral: true });
    return true;
  }

  const totalMs = minutes * 60 * 1000;
  const durationLabel = `${minutes} 分钟`;

  const deadline = new Date(Date.now() + totalMs);

  try {
    const prediction = createPrediction({
      guildId: interaction.guildId,
      title,
      options,
      deadline,
      createdBy: interaction.user.id,
      channelId: interaction.channel.id,
    });

    const channel = interaction.channel as TextChannel;
    const message = await channel.send({
      embeds: [buildPredictionEmbed(prediction)],
      components: buildPredictionButtons(prediction),
    });

    setPredictionMessage(prediction.id, message.id);

    await interaction.reply({
      content: `竞猜 #${prediction.id} 已发布，**${durationLabel}后**截止下注。成员点击按钮并输入金额即可下注。`,
      ephemeral: true,
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '创建失败';
    await interaction.reply({ content: message, ephemeral: true });
  }

  return true;
}
