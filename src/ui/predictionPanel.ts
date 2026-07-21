import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import {
  getOptionTotals,
  getPoolTotal,
  parseOptions,
  type PredictionRow,
} from '../services/prediction.js';
import { formatCoins } from '../utils/format.js';
import { discordTimestamp, fromSqliteDatetime } from '../utils/time.js';

export function buildPredictionEmbed(prediction: PredictionRow): EmbedBuilder {
  const options = parseOptions(prediction.options_json);
  const totals = getOptionTotals(prediction.id);
  const pool = getPoolTotal(prediction.id);
  const deadline = fromSqliteDatetime(prediction.deadline);

  let statusLabel = '进行中';
  let color = 0x57f287;
  if (prediction.status === 'closed') {
    statusLabel = '已截止';
    color = 0xfee75c;
  } else if (prediction.status === 'settled') {
    if (prediction.winner_option === 'CANCELLED') {
      statusLabel = '已取消 · 全额退款';
      color = 0x99aab5;
    } else {
      statusLabel = `已开奖 · 胜出：${prediction.winner_option}`;
      color = 0x5865f2;
    }
  }

  const optionEmojis = ['🟢', '🔴', '🔵', '🟣', '🟡'];
  const optionLines = options
    .map((opt, i) => `${optionEmojis[i] ?? '⚪'} **${opt}**：${formatCoins(totals[opt] ?? 0)}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🎯 ${prediction.title}`)
    .setColor(color)
    .setDescription(
      [
        `状态：**${statusLabel}**`,
        `截止：${discordTimestamp(deadline, 'F')}（${discordTimestamp(deadline, 'R')}）`,
        `奖池：**${formatCoins(pool)}**`,
        '',
        optionLines,
      ].join('\n'),
    )
    .setFooter({ text: `Prediction #${prediction.id} · ${config.currencyName}` });

  return embed;
}

export function buildPredictionButtons(prediction: PredictionRow): ActionRowBuilder<ButtonBuilder>[] {
  const options = parseOptions(prediction.options_json);
  const disabled = prediction.status !== 'open';
  const emojis = ['🟢', '🔴', '🔵', '🟣', '🟡'];

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet:${prediction.id}:${i}`)
        .setLabel(opt.slice(0, 80))
        .setEmoji(emojis[i] ?? '⚪')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    );
  }
  return [row];
}

export function buildBetModal(predictionId: number, optionIndex: number, optionLabel: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`betmodal:${predictionId}:${optionIndex}`)
    .setTitle(`下注：${optionLabel}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(`金额（${config.currencyName}）`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('例如 300')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10),
      ),
    );
}
