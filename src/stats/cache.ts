import type { GoogleSpreadsheetWorksheet, GoogleSpreadsheetRow } from 'google-spreadsheet';

const token: string = process.env.OSU_TOKEN ?? '';

const RATE_LIMIT_MS = 2000;

interface OsuMatchResult {
  match: {
    match_id: string;
    name: string;
    end_time: string | null;
  };
  games: OsuGame[];
}

interface OsuGame {
  game_id: string;
  beatmap_id: string;
  mods: string;
  scores: OsuScore[];
}

interface OsuScore {
  user_id: string;
  score: string;
  maxcombo: string;
  count50: string;
  count100: string;
  count300: string;
  countmiss: string;
  pass: string;
  enabled_mods: string | null;
}

interface SheetRow {
  get id(): string;
  set id(value: string);
  get value(): string;
  set value(value: string);
  delete(): Promise<void>;
  save(): Promise<void>;
}

const options = {
  offset: 0,
  limit: 2 ** 27,
};

let delay: Promise<void> | null = null;

const fetchMp = async (id: number): Promise<OsuMatchResult> => {
  let resolve: () => void;
  const old = delay;
  delay = new Promise<void>((rs) => (resolve = rs));
  await old;
  return fetch(
    `https://osu.ppy.sh/api/get_match?k=${token}&mp=${id}`,
  )
    .then((res) => res.json() as Promise<OsuMatchResult>)
    .finally(() => setTimeout(resolve!, RATE_LIMIT_MS));
};

export default class Cache extends Map<number, OsuMatchResult> {
  private _sheet: GoogleSpreadsheetWorksheet;

  constructor(sheet: GoogleSpreadsheetWorksheet) {
    super();
    this._sheet = sheet;
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
    const sheet = this._sheet;
    const list = (await sheet.getRows(options)) as unknown as SheetRow[];
    this.clear();
    for (const { id, value } of list) {
      this.set(+id, JSON.parse(value) as OsuMatchResult);
    }
  }

  async save(): Promise<void> {
    const sheet = this._sheet;
    const list = (await sheet.getRows(options)) as unknown as SheetRow[];
    const promises: Promise<unknown>[] = [];

    // Delete rows that are no longer in the cache
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
      promises.push(sheet.addRows(missing as any, { insert: true }));
    }
    await Promise.all(promises);
  }

  // Override Map methods to normalize id to number
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
