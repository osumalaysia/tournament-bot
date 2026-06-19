import type { pingCommand } from './types';
import * as Util from 'util';

const command: pingCommand = {
  name: 'eval',

  async execute(msg, args, _client) {
    try {
      const code = args
        .join(' ')
        .replace(/^```(?:[^\n]*\n)?([^]+)```$/, (_found: string, inner: string) => inner);

      const returned = await eval(`(async () => {\n${code}\n})`)();
      await msg.channel.send('```js\n' + Util.inspect(returned).substring(0, 2000 - 10) + '\n```');
    } catch (err: any) {
      await msg.channel.send('```js\n' + err.stack.substring(0, 2000 - 10) + '\n```');
    }
  },
};

module.exports = command;
export {};
