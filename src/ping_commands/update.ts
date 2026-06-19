import type { Message } from 'discord.js';
import type { pingMessage, pingCommand } from './types';
import { update } from '../stats/stats_util';

const { loadDoc } = require('../handler/googleSheetAuth');
const { STATS } = require('../config');

const command: pingCommand = {
  name: 'update',

  async execute(msg: pingMessage, _args: string[], _client: any) {
    const doc = await loadDoc(STATS.SHEET_ID);
    await update(doc, msg as any);
  },
};

module.exports = command;
export {};
