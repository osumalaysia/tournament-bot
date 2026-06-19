import type { GoogleSpreadsheet } from 'google-spreadsheet';
import type { Message, TextChannel } from 'discord.js';
import * as util from './util';
import Cache from './cache';
import * as formula from './formula';

const CODE_BLOCK = '```';
//Timer Helper
function createTimerContext() {
  const entries: string[] = [];

  const timer = (name: string): (() => void) => {
    const start = Date.now();
    return () => {
      const durationSec = (Date.now() - start) / 1000;
      entries.push(`\`${name}\` took ${durationSec}s`);
    };
  };

  return { timer, entries };
}

export async function update(doc: GoogleSpreadsheet, msg: Message): Promise<void> {
  const channel = msg.channel as TextChannel;
  const status = await channel.send('Updating....');
  const { timer, entries: timed } = createTimerContext();

  await doc.loadInfo();

  const cacheSheet = doc.sheetsByTitle['Cache']!;
  const outputSheet = doc.sheetsByTitle['_api']!;
  const cache = new Cache(cacheSheet);

  const [importTimer, cacheTimer] = (
    'Import Loader,Cache Loader'
      .split(',')
      .map((name) => timer(name))
  );

  const [mps] = await Promise.all([
    util
      .loadY(doc.sheetsByTitle['MP Links']!, 8, 4)
      .then((data) => data.map((row) => row[0] as number))
      .finally(importTimer),
    cache.load().finally(cacheTimer),
  ]);

  const processTimer = timer('Processing');
  await formula
    .StatsData(mps, outputSheet, (id) => cache.fetch(id))
    .finally(processTimer);

  const saveTimer = timer('Saving');
  await Promise.all([
    cache.save(),
    cacheSheet.saveUpdatedCells(),
    outputSheet.saveUpdatedCells(),
  ]).finally(saveTimer);

  await status.edit(
    `Stats Sheet has been updated\t${CODE_BLOCK}js\n${timed.join('\n')}\n${CODE_BLOCK}`,
  );
}

/*
export async function tupdate(doc: GoogleSpreadsheet, msg: Message): Promise<void> {
  const channel = msg.channel as TextChannel;
  const status = await channel.send('Updating....');
  const { timer, entries: timed } = createTimerContext();

  await doc.loadInfo();

  const cacheSheet = doc.sheetsByTitle['Cache']!;
  const outputSheet = doc.sheetsByTitle['Evaluation']!;
  const cache = new Cache(cacheSheet);

  const [importTimer, settingsTimer, cacheTimer] = (
    'Import Loader,Settings Loader,Cache Loader'
      .split(',')
      .map((name) => timer(name))
  );

  const [mps] = await Promise.all([
    util
      .loadY(doc.sheetsByTitle['Settings']!, 8, 2)
      .then((data) => data.map((row) => row[0] as number))
      .finally(importTimer),
    util
      .loadY(doc.sheetsByTitle['Modder']!, 2, 4)
      .then((data) => {
        formula.setParseModEnumSettings(data.map((row) => row[0] as number));
      })
      .finally(settingsTimer),
    cache.load().finally(cacheTimer),
  ]);

  const processTimer = timer('Processing');
  await formula
    .tmatchData(mps, outputSheet, (id) => cache.fetch(id))
    .finally(processTimer);

  const saveTimer = timer('Saving');
  await Promise.all([
    cache.save(),
    cacheSheet.saveUpdatedCells(),
    outputSheet.saveUpdatedCells(),
  ]).finally(saveTimer);

  await status.edit(
    `Tryout Sheet has been updated\t${CODE_BLOCK}js\n${timed.join('\n')}\n${CODE_BLOCK}`,
  );
}
*/