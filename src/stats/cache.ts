import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import type { OsuMatchResult, SheetRow } from './types';


const RATE_LIMIT_MS = 2000;
const SHEET_ROW_OPTIONS = { offset: 0, limit: 2 ** 27 };

let delay: Promise<void> | null = null;

const isOsuMatchResult = (body: unknown): body is OsuMatchResult =>
  typeof body === 'object'
  && body !== null
  && 'match' in body
  && 'games' in body
  && Array.isArray(body.games);

const fetchMp = async (id: number): Promise<OsuMatchResult> => {
  const osuApiToken = process.env.OSU_TOKEN;
  if (!osuApiToken) throw new Error('OSU_TOKEN is not set');

  let releaseDelay = (): void => {};
  const previousDelay = delay;
  delay = new Promise<void>((resolve) => {
    releaseDelay = resolve;
  });
  await previousDelay;

  try {
    const response = await fetch(
      `https://osu.ppy.sh/api/get_match?k=${osuApiToken}&mp=${id}`,
    );
    if (!response.ok) throw new Error(`osu! API returned ${response.status} for match ${id}`);

    const body: unknown = await response.json();
    if (!isOsuMatchResult(body)) throw new Error(`osu! API returned an unexpected body for match ${id}`);
    return body;
  } finally {
    setTimeout(releaseDelay, RATE_LIMIT_MS);
  }
};

export default class Cache extends Map<number, OsuMatchResult> {
  private readonly sheet: GoogleSpreadsheetWorksheet;

  constructor(sheet: GoogleSpreadsheetWorksheet) {
    super();
    this.sheet = sheet;
  }

  async fetch(id: number | string): Promise<OsuMatchResult> {
    const numericId = +id;

    const cached = this.get(numericId);
    if (cached && cached.match.end_time !== null) return cached;

    const result = await fetchMp(numericId);
    this.set(numericId, result);
    return result;
  }

  async load(): Promise<void> {
    const list = await this.sheet.getRows<SheetRow>(SHEET_ROW_OPTIONS);
    this.clear();
    for (const row of list) {
      const matchId = +row.get('id');
      const value: unknown = JSON.parse(row.get('value'));
      if (!(matchId > 0) || !isOsuMatchResult(value)) {
        throw new Error(`Cache sheet row ${row.rowNumber} is invalid`);
      }
      this.set(matchId, value);
    }
  }

  async save(): Promise<void> {
    const list = await this.sheet.getRows<SheetRow>(SHEET_ROW_OPTIONS);
    const promises: Promise<unknown>[] = [];

    for (const row of list) {
      if (this.has(+row.get('id'))) continue;
      console.log(row);
      await row.delete();
    }

    const missing: [string, string][] = [];
    for (const [id, value] of this.entries()) {
      const found = list.find((row) => !row.deleted && +row.get('id') === id) ?? null;
      const data = JSON.stringify(value);

      if (found !== null) {
        if (found.get('value') === data) continue;
        found.set('value', data);
        promises.push(found.save());
      } else {
        missing.push([String(id), JSON.stringify(value)]);
      }
    }

    if (missing.length) {
      promises.push(this.sheet.addRows(missing, { insert: true }));
    }

    await Promise.all(promises);
  }


  get(id: number | string): OsuMatchResult | undefined {
    return super.get(+id);
  }

  set(id: number | string, value: OsuMatchResult): this {
    return super.set(+id, value);
  }

  delete(id: number | string): boolean {
    return super.delete(+id);
  }

  has(id: number | string): boolean {
    return super.has(+id);
  }
}
