import type { PingCommand } from '../handler/PingCommandHandler';
import { update } from '../stats/stats_util';
import { getDoc } from '../handler/googleSheetAuth';
import { STATS } from '../config';

const command: PingCommand = {
  name: 'update',

  async execute(msg) {
    const doc = await getDoc(STATS.SHEET_ID);
    await update(doc, msg);
  },
};

export default command;
