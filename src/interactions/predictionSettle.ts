import type {
  ButtonInteraction,
  Client,
  StringSelectMenuInteraction,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import {
  getPrediction,
  listOpenPredictions,
  parseOptions,
  settlePrediction,
} from '../services/prediction.js';
import { buildSettleAnnouncementEmbed } from '../ui/predictionSettleAnnounce.js';
import { buildPredictionEmbed } from '../ui/predictionPanel.js';
import {
  buildSettleChoiceEmbed,
  buildSettleOptionComponents,
  buildSettlePredictionSelect,
  SETTLE_ABORT_ID,
  SETTLE_PICK_SELECT_ID,
  SETTLE_REFUND_PREFIX,
  SETTLE_WIN_PREFIX,
} from '../ui/predictionSettlePicker.js';
import { canManageBot } from '../utils/permissions.js';

export async function applySettle(input: {
  client: Client;
  guildId: string;
  predictionId: number;
  winner: string;
}) {
  const before = getPrediction(input.predictionId);
  if (!before || before.guild_id !== input.guildId) {
    throw new EconomyError('找不到该竞猜。');
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

  return result;
}

function requireAdmin(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): boolean {
  return Boolean(
    interaction.guildId &&
      interaction.member &&
      canManageBot(interaction.member, interaction.user.id),
  );
}

export async function handlePredictionSettleSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.customId !== SETTLE_PICK_SELECT_ID) return false;

  if (!requireAdmin(interaction)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return true;
  }

  const predictionId = Number.parseInt(interaction.values[0] ?? '', 10);
  const prediction = getPrediction(predictionId);
  if (!prediction || prediction.guild_id !== interaction.guildId) {
    await interaction.update({
      content: '找不到该竞猜，可能已被结算。',
      embeds: [],
      components: [],
    });
    return true;
  }

  if (prediction.status === 'settled') {
    await interaction.update({
      content: '该竞猜已经结算过了。',
      embeds: [],
      components: [],
    });
    return true;
  }

  await interaction.update({
    content: `已选择 **#${prediction.id}**，请点选获胜选项：`,
    embeds: [buildSettleChoiceEmbed(prediction)],
    components: buildSettleOptionComponents(prediction),
  });

  return true;
}

export async function handlePredictionSettleButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const id = interaction.customId;
  if (
    id !== SETTLE_ABORT_ID &&
    !id.startsWith(SETTLE_WIN_PREFIX) &&
    !id.startsWith(SETTLE_REFUND_PREFIX)
  ) {
    return false;
  }

  if (!requireAdmin(interaction) || !interaction.guildId) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return true;
  }

  if (id === SETTLE_ABORT_ID) {
    const list = listOpenPredictions(interaction.guildId);
    if (list.length === 0) {
      await interaction.update({
        content: '当前没有可结算的竞猜。',
        embeds: [],
        components: [],
      });
      return true;
    }
    await interaction.update({
      content: '请选择要结算的竞猜：',
      embeds: [],
      components: [buildSettlePredictionSelect(list)],
    });
    return true;
  }

  try {
    let predictionId: number;
    let winner: string;

    if (id.startsWith(SETTLE_REFUND_PREFIX)) {
      predictionId = Number.parseInt(id.slice(SETTLE_REFUND_PREFIX.length), 10);
      winner = '退款';
    } else {
      const rest = id.slice(SETTLE_WIN_PREFIX.length);
      const [idRaw, indexRaw] = rest.split(':');
      predictionId = Number.parseInt(idRaw ?? '', 10);
      const optionIndex = Number.parseInt(indexRaw ?? '', 10);
      const prediction = getPrediction(predictionId);
      if (!prediction || prediction.guild_id !== interaction.guildId) {
        throw new EconomyError('找不到该竞猜。');
      }
      const options = parseOptions(prediction.options_json);
      const option = options[optionIndex];
      if (!option) throw new EconomyError('无效选项。');
      winner = option;
    }

    if (!Number.isInteger(predictionId) || predictionId <= 0) {
      throw new EconomyError('无效竞猜 ID。');
    }

    const result = await applySettle({
      client: interaction.client,
      guildId: interaction.guildId,
      predictionId,
      winner,
    });

    await interaction.update({
      content:
        result.mode === 'refund'
          ? `已取消 **#${result.prediction.id}**，下注已全额退回。`
          : `已开奖 **#${result.prediction.id}**，获胜：**${result.winnerOption}**`,
      embeds: [],
      components: [],
    });

    const payload = {
      content:
        result.mode === 'refund'
          ? `竞猜 **#${result.prediction.id}**「${result.prediction.title}」已取消，下注已全额退回。`
          : `竞猜 **#${result.prediction.id}**「${result.prediction.title}」已开奖，获胜选项：**${result.winnerOption}**`,
      embeds: [buildSettleAnnouncementEmbed(result)],
    };

    if (interaction.channel && interaction.channel.isTextBased() && 'send' in interaction.channel) {
      await interaction.channel.send(payload);
    } else {
      await interaction.followUp(payload);
    }
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
