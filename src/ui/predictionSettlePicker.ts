import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  getOptionTotals,
  getPoolTotal,
  parseOptions,
  type PredictionRow,
} from '../services/prediction.js';
import { formatCoins } from '../utils/format.js';

export const SETTLE_PICK_SELECT_ID = 'settle:pick';
export const SETTLE_WIN_PREFIX = 'settle:win:';
export const SETTLE_REFUND_PREFIX = 'settle:refund:';
export const SETTLE_ABORT_ID = 'settle:abort';

const OPTION_EMOJIS = ['🟢', '🔴', '🔵', '🟣', '🟡'];

export function buildSettlePredictionSelect(
  predictions: PredictionRow[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(SETTLE_PICK_SELECT_ID)
    .setPlaceholder('选择要结算的竞猜')
    .addOptions(
      predictions.slice(0, 25).map((p) => {
        const options = parseOptions(p.options_json).join(' / ');
        return {
          label: `#${p.id} ${p.title}`.slice(0, 100),
          description: `${p.status} · ${options}`.slice(0, 100),
          value: String(p.id),
        };
      }),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildSettleChoiceEmbed(prediction: PredictionRow): EmbedBuilder {
  const options = parseOptions(prediction.options_json);
  const totals = getOptionTotals(prediction.id);
  const pool = getPoolTotal(prediction.id);

  const optionLines = options
    .map((opt, i) => `${OPTION_EMOJIS[i] ?? '⚪'} **${opt}**：${formatCoins(totals[opt] ?? 0, prediction.guild_id)}`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle(`结算：#${prediction.id}`)
    .setColor(0x5865f2)
    .setDescription(
      [
        `**${prediction.title}**`,
        `状态：${prediction.status} · 奖池 **${formatCoins(pool, prediction.guild_id)}**`,
        '',
        '点击下方按钮选择获胜选项，或点「取消并退款」。',
        '',
        optionLines,
      ].join('\n'),
    );
}

export function buildSettleOptionComponents(
  prediction: PredictionRow,
): Array<ActionRowBuilder<ButtonBuilder>> {
  const options = parseOptions(prediction.options_json);
  const optionRow = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    optionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${SETTLE_WIN_PREFIX}${prediction.id}:${i}`)
        .setLabel(opt.slice(0, 80))
        .setEmoji(OPTION_EMOJIS[i] ?? '⚪')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SETTLE_REFUND_PREFIX}${prediction.id}`)
      .setLabel('取消并退款')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(SETTLE_ABORT_ID)
      .setLabel('返回')
      .setStyle(ButtonStyle.Secondary),
  );

  return [optionRow, actionRow];
}
