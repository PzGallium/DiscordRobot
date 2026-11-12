import type { ButtonInteraction } from 'discord.js';
import { EconomyError } from '../services/economy.js';
import { acceptTransfer, rejectTransfer } from '../services/transfer.js';
import { getUserById } from '../services/user.js';
import { buildTransferButtons, buildTransferEmbed } from '../ui/transferButtons.js';
import { formatCoins } from '../utils/format.js';

export async function handleTransferButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('transfer:')) return false;

  const parts = interaction.customId.split(':');
  const action = parts[1];
  const transferId = Number(parts[2]);

  if (!interaction.guildId || (action !== 'accept' && action !== 'reject') || Number.isNaN(transferId)) {
    await interaction.reply({ content: '无效的按钮。', ephemeral: true });
    return true;
  }

  try {
    if (action === 'accept') {
      const { transfer, to } = acceptTransfer(transferId, interaction.user.id);
      const from = getUserById(transfer.from_user_id)!;

      await interaction.update({
        embeds: [
          buildTransferEmbed({
            transfer,
            from,
            to,
            statusNote: `✅ 已接受。收款人到账 ${formatCoins(transfer.amount, transfer.guild_id)}，手续费已销毁。`,
          }),
        ],
        components: [buildTransferButtons(transfer.id, true)],
      });
      return true;
    }

    const transfer = rejectTransfer(transferId, interaction.user.id);
    const from = getUserById(transfer.from_user_id)!;
    const to = getUserById(transfer.to_user_id)!;

    await interaction.update({
      embeds: [
        buildTransferEmbed({
          transfer,
          from,
          to,
          statusNote: `❌ 已拒绝。已退回 ${formatCoins(transfer.amount + transfer.fee, transfer.guild_id)} 给转出方。`,
        }),
      ],
      components: [buildTransferButtons(transfer.id, true)],
    });
  } catch (err) {
    const message = err instanceof EconomyError ? err.message : '操作失败';
    await interaction.reply({ content: message, ephemeral: true });
  }

  return true;
}
