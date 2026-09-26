import * as fs from 'fs';
import * as path from 'path';
import type { Client, Message, TextChannel } from 'discord.js';
import { CONFIG } from '../config';
import { logErrorToDiscord } from '../utils/errorLogger';

export interface PingCommand {
  name: string;
  execute: (msg: Message, args: string[], client: Client) => Promise<void>;
}

export function registerPingCommands(client: Client): void {
  const commands = new Map<string, PingCommand>();


  const commandsDir = path.join(__dirname, '../ping_commands');
  const files = fs.readdirSync(commandsDir).filter(
    (file: string) => (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts'),
  );

  for (const file of files) {
    const command: PingCommand = require(path.join(commandsDir, file)).default;
    commands.set(command.name, command);
    console.log(`Loaded ping command: ${command.name}`);
  }


  client.on('messageCreate', async (msg: Message) => {
    try {
      if (msg.author.id !== CONFIG.DEVELOPER_ID) return;

      const mention = `<@${client.user?.id}>`;
      if (!msg.content.startsWith(mention)) return;

      const text = msg.content.slice(mention.length).trim();
      const commandName = text.split(/\s/)[0]!.toLowerCase();
      const args = text.slice(commandName.length).trim().split(' ');

      const command = commands.get(commandName);
      if (!command) return;

      await command.execute(msg, args, client);
    } catch (err: any) {
      await logErrorToDiscord('ping command', err);
      const channel = msg.channel as TextChannel;
      await channel.send(`\`\`\`js\n${String(err?.stack ?? err).slice(0, 1980)}\n\`\`\``).catch(() => null);
    }
  });
}
