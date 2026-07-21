import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

export type SlashCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export type BotClient = Client & {
  commands: Collection<string, SlashCommand>;
};

export function createClient(): BotClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  }) as BotClient;

  client.commands = new Collection();
  return client;
}
