import type { TextChannel } from 'discord.js';
import * as Util from 'util';
import type { PingCommand } from '../handler/PingCommandHandler';
import { logErrorToDiscord } from '../utils/errorLogger';

const command: PingCommand = {
  name: 'eval',

  async execute(msg, args, _client) {
    const channel = msg.channel as TextChannel;
    try {
      const code = args
        .join(' ')
        .replace(/^```(?:[^\n]*\n)?([^]+)```$/, (_found: string, inner: string) => inner);

      const returned = await eval(`(async () => {\n${code}\n})`)();
      await channel.send('```js\n' + Util.inspect(returned).substring(0, 2000 - 10) + '\n```');
    } catch (err: any) {
      await logErrorToDiscord('eval command', err);
      await channel.send('```js\n' + err.stack.substring(0, 2000 - 10) + '\n```');
    }
  },
};

export default command;
