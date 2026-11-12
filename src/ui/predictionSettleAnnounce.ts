import { EmbedBuilder } from 'discord.js';
import { parseOptions, type SettleResult } from '../services/prediction.js';
import { formatCoins } from '../utils/format.js';
import { discordTimestamp, fromSqliteDatetime } from '../utils/time.js';

/** Public settlement announcement with full prediction details. */
export function buildSettleAnnouncementEmbed(result: SettleResult): EmbedBuilder {
  const { prediction } = result;
  const options = parseOptions(prediction.options_json);
  const deadline = fromSqliteDatetime(prediction.deadline);
  const cancelled = result.mode === 'refund';

  const optionLines = options.map((opt) => {
    const total = result.optionTotals[opt] ?? 0;
    const mark = !cancelled && opt === result.winnerOption ? ' ✅' : '';
    return `• **${opt}**：${formatCoins(total, prediction.guild_id)}${mark}`;
  });

  if (cancelled) {
    const refundLines =
      result.winners.length === 0
        ? ['（无人下注）']
        : result.winners.map(
            (w, i) =>
              `${i + 1}. <@${w.discordId}>（${w.nickname}）押 **${w.option}** · ${formatCoins(w.bet, prediction.guild_id)} → 已退回 **${formatCoins(w.payout, prediction.guild_id)}**`,
          );

    const description = [
      `**竞猜 ID**：#${prediction.id}`,
      `**标题**：${prediction.title}`,
      `**截止**：${discordTimestamp(deadline, 'F')}`,
      '',
      '**各选项下注**',
      ...optionLines,
      '',
      '**结果**：已取消（无人猜中 / 主动退款）',
      `**奖池**：${formatCoins(result.pool, prediction.guild_id)}（已全额退回）`,
      '',
      '**退款名单**',
      ...refundLines,
    ].join('\n');

    return new EmbedBuilder()
      .setTitle('↩️ 竞猜已取消 · 全额退款')
      .setColor(0x99aab5)
      .setDescription(description.slice(0, 4096))
      .setFooter({ text: `Prediction #${prediction.id} · cancelled` });
  }

  const winnerLines =
    result.winners.length === 0
      ? ['（无人押中获胜选项）']
      : result.winners.map(
          (w, i) =>
            `${i + 1}. <@${w.discordId}>（${w.nickname}）押 **${formatCoins(w.bet, prediction.guild_id)}** → 获得 **${formatCoins(w.payout, prediction.guild_id)}**`,
        );

  const loserLines =
    result.losers.length === 0
      ? []
      : [
          '',
          '**未中奖**',
          ...result.losers.map(
            (w) =>
              `• <@${w.discordId}>（${w.nickname}）押 **${w.option}** · ${formatCoins(w.bet, prediction.guild_id)} → 0`,
          ),
        ];

  const description = [
    `**竞猜 ID**：#${prediction.id}`,
    `**标题**：${prediction.title}`,
    `**截止**：${discordTimestamp(deadline, 'F')}`,
    '',
    '**各选项下注**',
    ...optionLines,
    '',
    `**开奖结果**：${result.winnerOption}`,
    `**奖池**：${formatCoins(result.pool, prediction.guild_id)}`,
    '',
    '**获奖名单**',
    ...winnerLines,
    ...loserLines,
  ].join('\n');

  return new EmbedBuilder()
    .setTitle('🏁 竞猜开奖结果')
    .setColor(0x5865f2)
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: `Prediction #${prediction.id} · settled` });
}
