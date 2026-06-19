export const MODS_ENUM = {
  NM: 0,
  NF: 1,
  EZ: 2,
  TD: 4,
  HD: 8,
  HR: 16,
  SD: 32,
  DT: 64,
  RX: 128,
  HT: 256,
  NC: 512,
  FL: 1024,
  AT: 2048,
  SO: 4096,
  AP: 8192,
  PF: 16384,
} as const;

export type ModAbbreviation = keyof typeof MODS_ENUM;

export function parseMods(bitflag: number): ModAbbreviation[] {
  const result: ModAbbreviation[] = [];
  for (const [key, value] of Object.entries(MODS_ENUM).reverse()) {
    if (bitflag & value) {
      result.push(key as ModAbbreviation);
    }
  }
  return result;
}

export function cleanMods(mods: ModAbbreviation[]): ModAbbreviation[] {
  let cleaned = [...mods];

  if (cleaned.includes('NC') && cleaned.includes('DT')) {
    cleaned.splice(cleaned.indexOf('DT'), 1);
  }

  if (cleaned.includes('NF') && cleaned.length === 1) {
    return ['NM'];
  }

  if (cleaned.includes('NF') && cleaned.length > 1) {
    cleaned.splice(cleaned.indexOf('NF'), 1);
  }

  return cleaned.reverse();
}
