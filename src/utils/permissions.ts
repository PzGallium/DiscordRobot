import {
  PermissionFlagsBits,
  PermissionsBitField,
  type APIInteractionGuildMember,
  type GuildMember,
} from 'discord.js';
import { config } from '../config.js';

export function isGuildAdmin(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): boolean {
  if (!member) return false;

  let perms: PermissionsBitField;
  if (member.permissions instanceof PermissionsBitField) {
    perms = member.permissions;
  } else if (typeof member.permissions === 'string') {
    perms = new PermissionsBitField(BigInt(member.permissions));
  } else {
    return false;
  }

  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

export function canManageBot(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
  userId: string,
): boolean {
  return config.botOwnerIds.has(userId) || isGuildAdmin(member);
}
