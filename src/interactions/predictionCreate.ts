import {
  ChannelType,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { createPrediction, setPredictionMessage } from '../services/prediction.js';
import {
  buildCreatePredictionModal,
  formatDurationLabel,
  isDurationPreset,
  parseDurationFields,
  PREDICTION_CREATE_MODAL_PREFIX,
  resolvePresetDuration,
  type DurationPresetValue,
} from '../ui/predictionCreateModal.js';
import { buildPredictionButtons, buildPredictionEmbed } from '../ui/predictionPanel.js';
import { isGuildAdmin } from '../utils/permissions.js';

export { buildCreatePredictionModal };

export async function handlePredictionCreateModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(PREDICTION_CREATE_MODAL_PREFIX)) return false;

  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return true;
  }

  if (!interaction.member || !isGuildAdmin(interaction.member)) {
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

  const durationKey = interaction.customId.slice(PREDICTION_CREATE_MODAL_PREFIX.length);
  if (!isDurationPreset(durationKey)) {
    await interaction.reply({ content: '无效的截止时长。', ephemeral: true });
    return true;
  }

  const title = interaction.fields.getTextInputValue('title').trim();
  const optionsRaw = interaction.fields.getTextInputValue('options');
  const options = optionsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let totalMs = 0;
  let durationLabel = '';

  if (durationKey === 'custom') {
    const duration = parseDurationFields(
      interaction.fields.getTextInputValue('days'),
      interaction.fields.getTextInputValue('hours'),
      interaction.fields.getTextInputValue('minutes'),
    );

    if (!duration) {
      await interaction.reply({
        content: '天 / 小时 / 分钟 请填写非负整数（例如 0、1、30）。',
        ephemeral: true,
      });
      return true;
    }
    if (duration.totalMs <= 0) {
      await interaction.reply({
        content: '截止时长必须大于 0，请至少填写分钟、小时或天中的一项。',
        ephemeral: true,
      });
      return true;
    }
    const maxMs = 30 * 24 * 60 * 60 * 1000;
    if (duration.totalMs > maxMs) {
      await interaction.reply({ content: '截止时长最长 30 天。', ephemeral: true });
      return true;
    }
    totalMs = duration.totalMs;
    durationLabel = formatDurationLabel(duration.days, duration.hours, duration.minutes);
  } else {
    const preset = resolvePresetDuration(durationKey as Exclude<DurationPresetValue, 'custom'>);
    totalMs = preset.totalMs;
    durationLabel = preset.label;
  }

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
