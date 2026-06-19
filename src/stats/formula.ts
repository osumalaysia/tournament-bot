import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import type {
  CellValue,
  Grade,
  MpFetcher,
  OsuGame,
  OsuMatchResult,
  OsuScore,
  StatsDataRow,
} from './types';
import { cleanMods, parseMods } from './mods';
import * as util from './util';

interface ParsedScore {
  matchName: string;
  matchID: number;
  scoreID: number;
  mapID: number;
  userID: number;
  score: number;
  combo: number;
  count50: number;
  count100: number;
  count300: number;
  countMiss: number;
  passStatus: boolean;
  forcedMods: number;
  mods: number;
  hitObjCount: number;
  accuracy: number;
}

function parseScoreEntry(game: OsuGame, scoreEntry: OsuScore, matchJson: OsuMatchResult,): ParsedScore {
  const count50 = parseInt(scoreEntry.count50, 10);
  const count100 = parseInt(scoreEntry.count100, 10);
  const count300 = parseInt(scoreEntry.count300, 10);
  const countMiss = parseInt(scoreEntry.countmiss, 10);
  const hitObjCount = countMiss + count50 + count100 + count300;

  return {
    matchName: matchJson.match.name,
    matchID: parseInt(matchJson.match.match_id, 10),
    scoreID: parseInt(game.game_id, 10),
    mapID: parseInt(game.beatmap_id, 10),
    userID: parseInt(scoreEntry.user_id, 10),
    score: parseInt(scoreEntry.score, 10),
    combo: parseInt(scoreEntry.maxcombo, 10),
    count50,
    count100,
    count300,
    countMiss,
    passStatus: parseInt(scoreEntry.pass, 10) === 1,
    forcedMods: parseInt(game.mods, 10),
    mods: scoreEntry.enabled_mods === null
      ? 0
      : parseInt(scoreEntry.enabled_mods, 10),
    hitObjCount,
    accuracy: (50 * count50 + 100 * count100 + 300 * count300) / (300 * hitObjCount),
  };
}

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


function transposeRows<T extends CellValue[]>(rows: T[]): CellValue[][] {
  return rows.reduce<CellValue[][]>((output, list) => {
    for (let col = 0; col < list.length; col++) {
      if (!(col in output)) output[col] = [];
      output[col]!.push(list[col]!);
    }
    return output;
  }, []);
}


// matchName | matchID | scoreID | mapID | userID | score | accuracy | grade | mods | pass

export async function StatsData(
  matchIds: (number | string)[],
  sheet: GoogleSpreadsheetWorksheet,
  mpFetcher: MpFetcher,
): Promise<void> {
  const outputArray: StatsDataRow[] = [];

  for (const matchId of matchIds) {
    if (!matchId) continue;

    const matchJson = await mpFetcher(matchId);
    if (!matchJson?.games) continue;

    for (const game of matchJson.games) {

      if (game.scores.length === 0) continue;

      for (const scoreEntry of game.scores) {
        const parsed = parseScoreEntry(game, scoreEntry, matchJson);
        const mods = cleanMods(parseMods(parsed.mods));
        const grade = calculateGrade(
          parsed.accuracy,
          parsed.count300,
          parsed.count50,
          parsed.countMiss,
          parsed.hitObjCount,
          mods.join(''),
        );

        outputArray.push([
          parsed.matchName,
          parsed.matchID,
          parsed.scoreID,
          parsed.mapID,
          parsed.userID,
          parsed.score,
          parsed.accuracy,
          grade,
          mods.join(''),
          parsed.passStatus,
        ]);
      }
    }
  }

  const transposed = transposeRows(outputArray);
  await util.putXY(sheet, 0, 1, ...transposed);
}
