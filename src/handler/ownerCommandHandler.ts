import * as fs from 'fs';
import * as path from 'path';
import type { Client, Message, TextChannel } from 'discord.js';
import type { pingCommand, pingMessage } from '../ping_commands/types';
import { CONFIG } from '../config';

export function registerOwnerCommands(client: Client): void {
  const commands = new Map<string, pingCommand>();


  const commandsDir = path.join(__dirname, '../owner_commands');
  const files = fs.readdirSync(commandsDir).filter(
    (file: string) =>
      (file.endsWith('.js') || file.endsWith('.ts')) &&
      !file.endsWith('.d.ts') &&
      file !== 'types.ts' &&
      file !== 'types.js',
  );

  for (const file of files) {
    const command: pingCommand = require(path.join(commandsDir, file));
    commands.set(command.name, command);
    console.log(`Loaded owner command: ${command.name}`);
  }


  client.on('messageCreate', async (msg: Message) => {
    try {
      if (msg.author.id !== CONFIG.DEVELOPER_ID) return;

      const args = msg.content.split(' ');
      const mention = args.shift();

      if (!mention || !new RegExp(`^<@!?${client.user?.id}>`).test(mention)) return;

      const commandName = args.shift()?.toLowerCase();
      if (!commandName) return;

      const command = commands.get(commandName);
      if (!command) return;

      await command.execute(msg as unknown as pingMessage, args, client);
    } catch (err: any) {
      const channel = msg.channel as TextChannel;
      await channel.send(`\`\`\`js\n${err.stack}\n\`\`\``);
    }
  });
}
