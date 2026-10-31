import * as Util from 'util';
import type { PingCommand } from '../handler/PingCommandHandler';
import { logErrorToDiscord } from '../utils/errorLogger';

const command: PingCommand = {
  name: 'eval',

  async execute(msg, args, _client) {
    const { channel } = msg;
    if (!channel.isSendable()) throw new Error('Cannot send messages in this channel');
    try {
      const code = args
        .join(' ')
        .replace(/^```(?:[^\n]*\n)?([^]+)```$/, (_found: string, inner: string) => inner);

      const returned = await eval(`(async () => {\n${code}\n})`)();
      await channel.send('```js\n' + Util.inspect(returned).substring(0, 2000 - 10) + '\n```');
    } catch (err) {
      await logErrorToDiscord('eval command', err);
      const details = err instanceof Error && err.stack ? err.stack : String(err);
      await channel.send('```js\n' + details.substring(0, 2000 - 10) + '\n```');
    }
  },
};

export default command;
