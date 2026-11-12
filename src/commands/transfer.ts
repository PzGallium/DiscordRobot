import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { createTransfer, setTransferMessage } from '../services/transfer.js';
import { buildTransferButtons, buildTransferEmbed } from '../ui/transferButtons.js';
import { formatCoins } from '../utils/format.js';

export const data = new SlashCommandBuilder()
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setName('transfer')
  .setDescription('向其他成员转账（需对方确认）')
  .addUserOption((opt) => opt.setName('user').setDescription('收款人').setRequired(true))
  .addIntegerOption((opt) =>
    opt.setName('amount').setDescription('到账金额').setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channel || !interaction.channel.isTextBased()) {
    await interaction.reply({ content: '只能在服务器频道里使用。', ephemeral: true });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);

  if (target.bot) {
    await interaction.reply({ content: '不能转账给机器人。', ephemeral: true });
    return;
  }

  const fromNickname =
    interaction.member && 'displayName' in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  try {
    const { transfer, from, to, totalDebit } = createTransfer({
      guildId: interaction.guildId,
      fromDiscordId: interaction.user.id,
      fromNickname,
      toDiscordId: target.id,
      toNickname: target.username,
      amount,
      channelId: interaction.channel.id,
    });

    const reply = await interaction.reply({
      content: `<@${target.id}> 你有一笔转账待确认`,
      embeds: [buildTransferEmbed({ transfer, from, to })],
      components: [buildTransferButtons(transfer.id)],
      fetchReply: true,
    });

    setTransferMessage(transfer.id, reply.id);

    await interaction.followUp({
      content: `已发起转账。已预扣 ${formatCoins(totalDebit)}（含手续费）。`,
      ephemeral: true,
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '转账失败';
    await interaction.reply({ content: message, ephemeral: true });
  }
}
