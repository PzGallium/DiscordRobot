import {
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { createRedPacket, setRedPacketMessage } from '../services/redpacket.js';
import { buildRedPacketButton, buildRedPacketEmbed } from '../ui/redpacketButtons.js';
import { formatCoins } from '../utils/format.js';
import { canManageBot } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('redpacket')
  .setDescription('发放红包（管理员，从你的余额扣除）')
  .addIntegerOption((opt) =>
    opt.setName('amount').setDescription('总金额').setRequired(true).setMinValue(1),
  )
  .addIntegerOption((opt) =>
    opt.setName('count').setDescription('红包个数').setRequired(true).setMinValue(1).setMaxValue(100),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channel) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return;
  }

  if (!interaction.member || !canManageBot(interaction.member, interaction.user.id)) {
    await interaction.reply({ content: '需要管理员权限。', ephemeral: true });
    return;
  }

  if (
    interaction.channel.type !== ChannelType.GuildText &&
    interaction.channel.type !== ChannelType.GuildAnnouncement
  ) {
    await interaction.reply({ content: '请在文字频道中发放。', ephemeral: true });
    return;
  }

  const amount = interaction.options.getInteger('amount', true);
  const count = interaction.options.getInteger('count', true);
  const nickname =
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  try {
    const { packet, creator } = createRedPacket({
      guildId: interaction.guildId,
      creatorDiscordId: interaction.user.id,
      creatorNickname: nickname,
      totalAmount: amount,
      count,
      channelId: interaction.channel.id,
    });

    const channel = interaction.channel as TextChannel;
    const message = await channel.send({
      embeds: [buildRedPacketEmbed(packet, creator)],
      components: [buildRedPacketButton(packet.id)],
    });
    setRedPacketMessage(packet.id, message.id);

    await interaction.reply({
      content: `红包已发出：${formatCoins(amount)} / ${count} 个。已从你的余额扣除。`,
      ephemeral: true,
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '发红包失败';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
