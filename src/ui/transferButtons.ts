import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { TransferRow } from '../services/transfer.js';
import type { UserRow } from '../services/user.js';
import { formatCoins } from '../utils/format.js';

export function buildTransferEmbed(input: {
  transfer: TransferRow;
  from: UserRow;
  to: UserRow;
  statusNote?: string;
}): EmbedBuilder {
  const { transfer, from, to, statusNote } = input;
  const total = transfer.amount + transfer.fee;

  return new EmbedBuilder()
    .setTitle('💸 转账请求')
    .setColor(transfer.status === 'pending' ? 0x5865f2 : 0x99aab5)
    .setDescription(
      [
        `<@${from.discord_id}> → <@${to.discord_id}>`,
        `到账：**${formatCoins(transfer.amount, transfer.guild_id)}**`,
        `手续费：**${formatCoins(transfer.fee, transfer.guild_id)}**（${(transfer.fee_bps / 100).toFixed(1)}%）`,
        `转出合计：**${formatCoins(total, transfer.guild_id)}**`,
        statusNote ? `\n${statusNote}` : '收款人请点击下方按钮确认或拒绝。',
      ].join('\n'),
    )
    .setFooter({ text: `Transfer #${transfer.id}` });
}

export function buildTransferButtons(transferId: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`transfer:accept:${transferId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`transfer:reject:${transferId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}
