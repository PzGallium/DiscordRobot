import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { RedPacketRow } from '../services/redpacket.js';
import type { UserRow } from '../services/user.js';
import { formatCoins } from '../utils/format.js';

export function buildRedPacketEmbed(packet: RedPacketRow, creator: UserRow): EmbedBuilder {
  const finished = packet.status !== 'open' || packet.remaining_count <= 0;
  return new EmbedBuilder()
    .setTitle('🧧 红包')
    .setColor(finished ? 0x99aab5 : 0xed4245)
    .setDescription(
      [
        `来自：<@${creator.discord_id}>`,
        `总额：**${formatCoins(packet.total_amount)}**`,
        `剩余：${packet.remaining_count}/${packet.count} 个 · ${formatCoins(packet.remaining_amount)}`,
        finished ? '\n已领完。' : '\n点击下方按钮领取（每人限一次）。',
      ].join('\n'),
    )
    .setFooter({ text: `Red packet #${packet.id}` });
}

export function buildRedPacketButton(packetId: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`redpacket:claim:${packetId}`)
      .setLabel('领取')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}
