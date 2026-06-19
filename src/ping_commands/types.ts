import type { Client, TextChannel } from 'discord.js';

export interface pingMessage {
  author: { id: string };
  content: string;
  channel: TextChannel;
}

export interface pingCommand {
  name: string;
  execute: (msg: pingMessage, args: string[], client: Client) => Promise<void>;
}
