import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import type { OsuMatchResult, SheetRow } from './types';


const OSU_API_TOKEN: string = process.env.OSU_TOKEN ?? '';
const RATE_LIMIT_MS = 2000;
const SHEET_ROW_OPTIONS = { offset: 0, limit: 2 ** 27 };

let delay: Promise<void> | null = null;

const fetchMp = async (id: number): Promise<OsuMatchResult> => {
  let resolve: () => void;
  const old = delay;
  delay = new Promise<void>((rs) => (resolve = rs));
  await old;

  return fetch(
    `https://osu.ppy.sh/api/get_match?k=${OSU_API_TOKEN}&mp=${id}`,
  )
    .then((res) => res.json() as Promise<OsuMatchResult>)
    .finally(() => setTimeout(resolve!, RATE_LIMIT_MS));
};

export default class Cache extends Map<number, OsuMatchResult> {
  private readonly sheet: GoogleSpreadsheetWorksheet;

  constructor(sheet: GoogleSpreadsheetWorksheet) {
    super();
    this.sheet = sheet;
  }

  async fetch(id: number | string): Promise<OsuMatchResult> {
    const numericId = +id;

    if (this.has(numericId)) {
      const mp = this.get(numericId)!;
      if (mp.match.end_time !== null) return mp;
    }

    const result = await fetchMp(numericId);
    this.set(numericId, result);
    return result;
  }

  async load(): Promise<void> {
    const list = (await this.sheet.getRows(SHEET_ROW_OPTIONS)) as unknown as SheetRow[];
    this.clear();
    for (const { id, value } of list) {
      this.set(+id, JSON.parse(value) as OsuMatchResult);
    }
  }

  async save(): Promise<void> {
    const list = (await this.sheet.getRows(SHEET_ROW_OPTIONS)) as unknown as SheetRow[];
    const promises: Promise<unknown>[] = [];

    for (const row of list) {
      if (this.has(+row.id)) continue;
      console.log(row);
      promises.push(row.delete());
    }

    const missing: [string, string][] = [];
    for (const [id, value] of this.entries()) {
      const found = list.find((row) => +row.id === id) ?? null;
      const data = JSON.stringify(value);

      if (found !== null) {
        if (found.value === data) continue;
        found.value = data;
        promises.push(found.save());
      } else {
        missing.push([String(id), JSON.stringify(value)]);
      }
    }

    if (missing.length) {
      promises.push(this.sheet.addRows(missing as any, { insert: true }));
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
