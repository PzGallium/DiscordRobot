import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { EconomyError } from '../services/economy.js';
import {
  getPrediction,
  isBettingOpen,
  parseOptions,
  placeBet,
} from '../services/prediction.js';
import { buildBetModal, buildPredictionButtons, buildPredictionEmbed } from '../ui/predictionPanel.js';
import { formatCoins, parsePositiveInt } from '../utils/format.js';

export async function handleBetButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('bet:')) return false;

  const parts = interaction.customId.split(':');
  const predictionId = Number(parts[1]);
  const optionIndex = Number(parts[2]);

  if (!interaction.guildId || Number.isNaN(predictionId) || Number.isNaN(optionIndex)) {
    await interaction.reply({ content: '无效的按钮。', ephemeral: true });
    return true;
  }

  const prediction = getPrediction(predictionId);
  if (!prediction || prediction.guild_id !== interaction.guildId) {
    await interaction.reply({ content: '竞猜不存在。', ephemeral: true });
    return true;
  }

  if (!isBettingOpen(prediction)) {
    await interaction.reply({ content: '下注已截止。', ephemeral: true });
    return true;
  }

  const options = parseOptions(prediction.options_json);
  const option = options[optionIndex];
  if (!option) {
    await interaction.reply({ content: '无效选项。', ephemeral: true });
    return true;
  }

  await interaction.showModal(buildBetModal(predictionId, optionIndex, option));
  return true;
}

export async function handleBetModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('betmodal:')) return false;

  const parts = interaction.customId.split(':');
  const predictionId = Number(parts[1]);
  const optionIndex = Number(parts[2]);

  if (!interaction.guildId || Number.isNaN(predictionId) || Number.isNaN(optionIndex)) {
    await interaction.reply({ content: '无效的提交。', ephemeral: true });
    return true;
  }

  const amount = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
  if (amount === null) {
    await interaction.reply({ content: '请输入正整数金额。', ephemeral: true });
    return true;
  }

  const prediction = getPrediction(predictionId);
  if (!prediction || prediction.guild_id !== interaction.guildId) {
    await interaction.reply({ content: '竞猜不存在。', ephemeral: true });
    return true;
  }

  const options = parseOptions(prediction.options_json);
  const option = options[optionIndex];
  if (!option) {
    await interaction.reply({ content: '无效选项。', ephemeral: true });
    return true;
  }

  const nickname =
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  try {
    const result = placeBet({
      predictionId,
      guildId: interaction.guildId,
      discordId: interaction.user.id,
      nickname,
      option,
      amount,
    });

    await interaction.reply({
      content: `下注成功！\n**${result.option}** · ${formatCoins(result.amount)}\n余额：${formatCoins(result.balance)}`,
      ephemeral: true,
    });

    const refreshed = getPrediction(predictionId)!;
    if (refreshed.channel_id && refreshed.message_id) {
      try {
        const channel = await interaction.client.channels.fetch(refreshed.channel_id);
        if (channel && channel.isTextBased() && 'messages' in channel) {
          const msg = await channel.messages.fetch(refreshed.message_id);
          await msg.edit({
            embeds: [buildPredictionEmbed(refreshed)],
            components: buildPredictionButtons(refreshed),
          });
        }
      } catch {
        // best-effort panel refresh
      }
    }
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '下注失败';
    await interaction.reply({ content: message, ephemeral: true });
  }

  return true;
}
