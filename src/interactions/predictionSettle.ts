import type { Client, ModalSubmitInteraction } from 'discord.js';
import { EconomyError } from '../services/economy.js';
import {
  getPrediction,
  settlePrediction,
} from '../services/prediction.js';
import { buildSettleAnnouncementEmbed } from '../ui/predictionSettleAnnounce.js';
import { PREDICTION_SETTLE_MODAL_ID } from '../ui/predictionSettleModal.js';
import { buildPredictionEmbed } from '../ui/predictionPanel.js';
import { isGuildAdmin } from '../utils/permissions.js';

export async function applySettleAndReply(input: {
  client: Client;
  guildId: string;
  predictionId: number;
  winner: string;
  reply: (payload: { content?: string; embeds: ReturnType<typeof buildSettleAnnouncementEmbed>[] }) => Promise<unknown>;
}): Promise<void> {
  const before = getPrediction(input.predictionId);
  if (!before || before.guild_id !== input.guildId) {
    await input.reply({ content: '找不到该竞猜。', embeds: [] });
    return;
  }

  const result = settlePrediction(input.predictionId, input.winner);
  const refreshed = getPrediction(input.predictionId)!;

  if (refreshed.channel_id && refreshed.message_id) {
    try {
      const channel = await input.client.channels.fetch(refreshed.channel_id);
      if (channel && channel.isTextBased() && 'messages' in channel) {
        const msg = await channel.messages.fetch(refreshed.message_id);
        await msg.edit({
          embeds: [buildPredictionEmbed(refreshed)],
          components: [],
        });
      }
    } catch {
      // panel update best-effort
    }
  }

  await input.reply({
    content: `竞猜 **#${result.prediction.id}**「${result.prediction.title}」已开奖，获胜选项：**${result.winnerOption}**`,
    embeds: [buildSettleAnnouncementEmbed(result)],
  });
}

export async function handlePredictionSettleModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== PREDICTION_SETTLE_MODAL_ID) return false;

  if (!interaction.guildId) {
    await interaction.reply({ content: '只能在服务器里使用。', ephemeral: true });
    return true;
  }

  if (!interaction.member || !isGuildAdmin(interaction.member)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return true;
  }

  const idRaw = interaction.fields.getTextInputValue('id').trim();
  const winner = interaction.fields.getTextInputValue('winner').trim();
  const predictionId = Number.parseInt(idRaw, 10);

  if (!Number.isInteger(predictionId) || predictionId <= 0) {
    await interaction.reply({ content: '竞猜 ID 必须是正整数。', ephemeral: true });
    return true;
  }

  if (!winner) {
    await interaction.reply({ content: '请填写获胜选项。', ephemeral: true });
    return true;
  }

  try {
    await applySettleAndReply({
      client: interaction.client,
      guildId: interaction.guildId,
      predictionId,
      winner,
      reply: async (payload) => {
        await interaction.reply(payload);
      },
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '开奖失败';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }

  return true;
}
