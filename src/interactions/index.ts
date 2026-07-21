import type { Interaction } from 'discord.js';
import { handleBetButton, handleBetModal } from './bet.js';
import { handleRedPacketButton } from './redpacket.js';
import { handleTransferButton } from './transfer.js';

export async function handleComponentInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isButton()) {
    if (await handleBetButton(interaction)) return true;
    if (await handleTransferButton(interaction)) return true;
    if (await handleRedPacketButton(interaction)) return true;
  }

  if (interaction.isModalSubmit()) {
    if (await handleBetModal(interaction)) return true;
  }

  return false;
}
