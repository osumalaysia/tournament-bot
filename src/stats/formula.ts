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

        const grade = calculateGrade(
          parsed.accuracy,
          parsed.count300,
          parsed.count50,
          parsed.countMiss,
          parsed.hitObjCount,
          parsed.enabledMods.toString(),
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
          parsed.enabledMods.toString(),
          parsed.passStatus,
        ]);
      }
    }
  }

  const transposed = transposeRows(outputArray);
  await util.putXY(sheet, 2, 2, ...transposed);
}
