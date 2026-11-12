import type { ButtonInteraction } from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { claimRedPacket, getRedPacket } from '../services/redpacket.js';
import { getUserById } from '../services/user.js';
import { buildRedPacketButton, buildRedPacketEmbed } from '../ui/redpacketButtons.js';
import { formatCoins } from '../utils/format.js';

export async function handleRedPacketButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('redpacket:claim:')) return false;

  const packetId = Number(interaction.customId.split(':')[2]);
  if (!interaction.guildId || Number.isNaN(packetId)) {
    await interaction.reply({ content: '无效的按钮。', ephemeral: true });
    return true;
  }

  const nickname =
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  try {
    const result = claimRedPacket({
      packetId,
      guildId: interaction.guildId,
      discordId: interaction.user.id,
      nickname,
    });

    const creator = getUserById(result.packet.created_by)!;
    const finished = result.packet.status !== 'open' || result.packet.remaining_count <= 0;

    await interaction.update({
      embeds: [buildRedPacketEmbed(result.packet, creator)],
      components: [buildRedPacketButton(result.packet.id, finished)],
    });

    await interaction.followUp({
      content: `你领到了 **${formatCoins(result.amount, result.packet.guild_id)}**！余额：${formatCoins(result.user.balance, result.packet.guild_id)}`,
      ephemeral: true,
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '领取失败';
    const packet = getRedPacket(packetId);
    if (packet && (packet.status !== 'open' || packet.remaining_count <= 0)) {
      try {
        const creator = getUserById(packet.created_by);
        if (creator) {
          await interaction.update({
            embeds: [buildRedPacketEmbed(packet, creator)],
            components: [buildRedPacketButton(packet.id, true)],
          });
          await interaction.followUp({ content: message, ephemeral: true });
          return true;
        }
      } catch {
        // fall through
      }
    }
    await interaction.reply({ content: message, ephemeral: true });
  }

  return true;
}
