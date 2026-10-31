import * as fs from 'fs';
import * as path from 'path';
import type { Client, Message } from 'discord.js';
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
      const [firstWord = ''] = text.split(/\s/);
      const commandName = firstWord.toLowerCase();
      const args = text.slice(commandName.length).trim().split(' ');

      const command = commands.get(commandName);
      if (!command) return;

      await command.execute(msg, args, client);
    } catch (err) {
      await logErrorToDiscord('ping command', err);
      const details = err instanceof Error && err.stack ? err.stack : String(err);
      const { channel } = msg;
      if (channel.isSendable()) {
        await channel.send(`\`\`\`js\n${details.slice(0, 1980)}\n\`\`\``).catch(() => null);
      }
    }
  });
}
