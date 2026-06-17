import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import * as util from './util';

// --- Types ---

interface ModEntry {
  name: string;
  abbr: string;
  value: number;
  multiplier: number | string;
}

type StatsDataRow = [
  matchName: string,
  matchID: number,
  scoreID: number,
  mapID: number,
  userID: number,
  score: number,
  accuracy: number,
  playerMods: string,
  grade: string,
  passStatus: boolean,
];

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

type MpFetcher = (id: number | string) => Promise<OsuMatchResult>;

type Grade = 'SSH' | 'SS' | 'SH' | 'S' | 'A' | 'B' | 'C' | 'D';

// --- Mod Enum ---

export let parseModEnumSettings: number[] | null = null;

export function setParseModEnumSettings(settings: number[]): void {
  parseModEnumSettings = settings;
}

function buildModEnum(multiplierChangeArr: number[]): ModEntry[] {
  return [
    { name: 'None', abbr: 'NM', value: 0, multiplier: multiplierChangeArr[0]! },
    { name: 'NoFail', abbr: 'NF', value: 1, multiplier: multiplierChangeArr[1]! },
    { name: 'Easy', abbr: 'EZ', value: 2, multiplier: 0.5 * multiplierChangeArr[2]! },
    { name: 'TouchDevice', abbr: 'TD', value: 4, multiplier: multiplierChangeArr[0]! },
    { name: 'Hidden', abbr: 'HD', value: 8, multiplier: 1.06 * multiplierChangeArr[3]! },
    { name: 'DoubleTime', abbr: 'DT', value: 64, multiplier: 1.2 * multiplierChangeArr[5]! },
    { name: 'HardRock', abbr: 'HR', value: 16, multiplier: 1.1 * multiplierChangeArr[4]! },
    { name: 'SuddenDeath', abbr: 'SD', value: 32, multiplier: multiplierChangeArr[0]! },
    { name: 'Relax', abbr: 'RX', value: 128, multiplier: multiplierChangeArr[6]! },
    { name: 'HalfTime', abbr: 'HT', value: 256, multiplier: 0.3 * multiplierChangeArr[7]! },
    { name: 'Nightcore', abbr: 'NC', value: 512, multiplier: 1 },
    { name: 'Flashlight', abbr: 'FL', value: 1024, multiplier: 1.12 * multiplierChangeArr[8]! },
    { name: 'SpunOut', abbr: 'SO', value: 4096, multiplier: 0.9 * multiplierChangeArr[9]! },
    { name: 'Perfect', abbr: 'PF', value: 16384, multiplier: 1 * multiplierChangeArr[0]! },
    { name: 'Key4', abbr: 'K4', value: 32768, multiplier: 'key4' },
    { name: 'Key5', abbr: 'K5', value: 65536, multiplier: 'key5' },
    { name: 'Key6', abbr: 'K6', value: 131072, multiplier: 'key6' },
    { name: 'Key7', abbr: 'K7', value: 262144, multiplier: 'key7' },
    { name: 'Key8', abbr: 'K8', value: 524288, multiplier: 'key8' },
    { name: 'FadeIn', abbr: 'FI', value: 1048576, multiplier: multiplierChangeArr[0]! },
    { name: 'Key9', abbr: 'K9', value: 16777216, multiplier: 'key9' },
    { name: 'Key1', abbr: 'K1', value: 67108864, multiplier: 'key1' },
    { name: 'Key3', abbr: 'K3', value: 134217728, multiplier: 'key3' },
    { name: 'Key2', abbr: 'K2', value: 268435456, multiplier: 'key2' },
    { name: 'Mirror', abbr: 'MR', value: 1073741824, multiplier: multiplierChangeArr[0]! },
  ];
}

// Return type depends on returnType: 1 => number, 2 => string, 3 => string
export function parseModEnum(enumNumber: number, returnType: 1): number;
export function parseModEnum(enumNumber: number, returnType: 2): string;
export function parseModEnum(enumNumber: number, returnType: 3): string;
export function parseModEnum(enumNumber: number, returnType: 1 | 2 | 3): number | string {
  if (parseModEnumSettings === null) {
    throw new Error('Please set the multiplier');
  }

  const modEnum = buildModEnum(parseModEnumSettings);

  // Handle the "None" (0) case
  if (enumNumber === 0) {
    if (returnType === 1) return modEnum[0]!.multiplier as number;
    if (returnType === 2) return modEnum[0]!.abbr;
    return modEnum[0]!.name;
  }

  const resultMultipliers: number[] = [];
  const resultStrings: string[] = [];

  for (const mod of modEnum) {
    if ((enumNumber & mod.value) > 0) {
      // Nightcore (512) is skipped in all return types
      if (mod.value === 512) continue;

      // Perfect (16384) falls back to modEnum[13] (which is the Perfect entry at index 13)
      const effective = mod.value === 16384 ? modEnum[13]! : mod;

      if (returnType === 1) {
        resultMultipliers.push(effective.multiplier as number);
      } else if (returnType === 2) {
        resultStrings.push(effective.abbr);
      } else {
        resultStrings.push(effective.name);
      }
    }
  }

  if (returnType === 1) {
    return resultMultipliers.reduce((a, b) => a * b, 1);
  }
  if (returnType === 2) {
    return resultStrings.join('');
  }
  return resultStrings.join(', ');
}

// --- Grade Calculation ---

function calculateGrade(
  accuracy: number,
  count300: number,
  count50: number,
  countMiss: number,
  hitObjCount: number,
  modString: string,
): Grade {
  const hasHDorFL = modString.includes('HD') || modString.includes('FL');

  if (accuracy === 1) {
    return hasHDorFL ? 'SSH' : 'SS';
  }
  if (count300 > hitObjCount * 0.9 && count50 < hitObjCount * 0.01 && countMiss === 0) {
    return hasHDorFL ? 'SH' : 'S';
  }
  if ((count300 > hitObjCount * 0.8 && countMiss === 0) || count300 > hitObjCount * 0.9) {
    return 'A';
  }
  if ((count300 > hitObjCount * 0.7 && countMiss === 0) || count300 > hitObjCount * 0.8) {
    return 'B';
  }
  if (count300 > hitObjCount * 0.6) {
    return 'C';
  }
  return 'D';
}

// --- Resolve player mods, score multiplier, and mod string ---

interface ResolvedMods {
  playerMods: string;
  scoreMult: number;
  isHDorFL: string;
}

function resolveMods(enabledMods: number, forcedMods: number): ResolvedMods {
  if (enabledMods === 0 || isNaN(enabledMods)) {
    return {
      playerMods: parseModEnum(forcedMods, 2),
      scoreMult: parseModEnum(forcedMods, 1),
      isHDorFL: parseModEnum(forcedMods, 2),
    };
  }
  return {
    playerMods: parseModEnum(enabledMods, 2),
    scoreMult: parseModEnum(enabledMods, 1),
    isHDorFL: parseModEnum(enabledMods, 2),
  };
}

// --- Parse score entry helpers ---

function parseScoreEntry(game: OsuGame, scoreEntry: OsuScore, matchJson: OsuMatchResult) {
  const matchName = matchJson.match.name;
  const matchID = parseInt(matchJson.match.match_id, 10);
  const userID = parseInt(scoreEntry.user_id, 10);
  const mapID = parseInt(game.beatmap_id, 10);
  const score = parseInt(scoreEntry.score, 10);
  const combo = parseInt(scoreEntry.maxcombo, 10);
  const count50 = parseInt(scoreEntry.count50, 10);
  const count100 = parseInt(scoreEntry.count100, 10);
  const count300 = parseInt(scoreEntry.count300, 10);
  const countMiss = parseInt(scoreEntry.countmiss, 10);
  const passStatus = parseInt(scoreEntry.pass, 10) === 1;
  const forcedMods = parseInt(game.mods, 10);
  const scoreID = parseInt(game.game_id, 10);
  const enabledMods =
    scoreEntry.enabled_mods === null ? 0 : parseInt(scoreEntry.enabled_mods, 10);
  const hitObjCount = countMiss + count50 + count100 + count300;
  const accuracy = (50 * count50 + 100 * count100 + 300 * count300) / (300 * hitObjCount);

  return {
    matchName,
    matchID,
    userID,
    mapID,
    score,
    combo,
    count50,
    count100,
    count300,
    countMiss,
    passStatus,
    forcedMods,
    enabledMods,
    hitObjCount,
    accuracy,
    scoreID,
  };
}

// --- Transpose helper ---

type CellValue = string | number | boolean | null;

function transposeRows<T extends CellValue[]>(rows: T[]): CellValue[][] {
  return rows.reduce<CellValue[][]>((output, list) => {
    for (let key = 0; key < list.length; key++) {
      if (!(key in output)) output[key] = [];
      output[key]!.push(list[key]!);
    }
    return output;
  }, []);
}


// --- Qualifier Match Data ---

export async function StatsData(
  matchIds: (number | string)[],
  sheet: GoogleSpreadsheetWorksheet,
  mpFetcher: MpFetcher,
): Promise<void> {
  const outputArray: StatsDataRow[] = [];

  for (const matchId of matchIds) {
    if (!matchId) continue;

    const matchJson = await mpFetcher(matchId);

    for (const game of matchJson.games) {
      if (game.scores.length === 0) continue;

      for (const scoreEntry of game.scores) {
        const parsed = parseScoreEntry(game, scoreEntry, matchJson);
        const { playerMods, scoreMult, isHDorFL } = resolveMods(
          parsed.enabledMods,
          parsed.forcedMods,
        );
        const grade = calculateGrade(
          parsed.accuracy,
          parsed.count300,
          parsed.count50,
          parsed.countMiss,
          parsed.hitObjCount,
          isHDorFL,
        );
        // Match Name    Match ID    User ID    Map ID    Score    Pass Status
        outputArray.push([
          parsed.matchName,
          parsed.matchID,
          parsed.scoreID,
          parsed.mapID,
          parsed.userID,
          parsed.score,
          parsed.accuracy,
          grade,
          playerMods,
          parsed.passStatus,
        ]);
      }
    }
  }

  const transposed = transposeRows(outputArray);
  await util.putXY(sheet, 2, 2, ...transposed);
}
