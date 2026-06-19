import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import type { CellValue } from './types';


const COLUMN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const columnToLetter = (offset: number, chars: string = COLUMN_CHARS): string => {
  if (typeof offset !== 'number') throw new TypeError('offset should be a number');
  const base = chars.length;
  const output: number[] = [offset % base];
  for (let remain = Math.floor(offset / base); remain--;) {
    output.unshift(remain % base);
    remain = Math.floor(remain / base);
  }
  return output.map((n) => chars[n]).join('');
};

const formatRange = (
  x: number,
  y: number,
  width: number = 1,
  height: number = 1,
): string =>
  `${columnToLetter(x)}${y + 1}:${columnToLetter(x + width - 1)}${y + height}`;

export const loadY = async (
  sheet: GoogleSpreadsheetWorksheet,
  x: number,
  y: number,
  more: number = 1,
  preload: number = 50,
): Promise<CellValue[][]> => {
  const output: CellValue[][] = [];
  let offsetY = y;

  while (true) {
    if (offsetY + preload > sheet.rowCount) preload = sheet.rowCount - offsetY;
    else if (offsetY + 1 === sheet.rowCount) return output;

    await sheet.loadCells(formatRange(x, offsetY, more, preload));

    for (let amount = preload; amount; --amount, ++offsetY) {
      const current: CellValue[] = [];
      let offsetX = x;

      current.push(sheet.getCell(offsetY, offsetX).value as CellValue);
      if (current[0] === null) return output;

      for (let colsLeft = more; --colsLeft;) {
        current.push(sheet.getCell(offsetY, ++offsetX).value as CellValue);
      }
      output.push(current);
    }
  }
};

export const putXY = async (
  sheet: GoogleSpreadsheetWorksheet,
  x: number,
  y: number,
  ...data: CellValue[][]
): Promise<void> => {
  const xSize = data.length;
  const ySize = data.reduce(
    (max, col) => (col.length > max ? col.length : max),
    0,
  );
  if (!ySize || !xSize) return;

  await sheet.loadCells(formatRange(x, y, xSize, ySize));

  data.forEach((column, xIndex) => {
    const xOffset = x + xIndex;
    column.forEach((value, yIndex) => {
      try {
        const yOffset = y + yIndex;
        const cell = sheet.getCell(yOffset, xOffset);
        if (cell.value === value) return;
        cell.value = value as string | number | boolean;
      } catch {
      }
    });
  });
};

// Box-drawing characters: ─ │ ┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘

const appendBorderLine = (
  output: string[],
  widths: number[],
  left: string,
  mid: string,
  right: string,
): void => {
  if (!widths.length) return;
  output.push(left);
  widths.forEach((width, i, arr) => {
    output.push('─'.repeat(2 + width));
    output.push(i === arr.length - 1 ? right : mid);
  });
};

const appendDataRow = (
  output: string[],
  widths: number[],
  cells: string[],
): void => {
  if (!widths.length) return;
  output.push('│');
  widths.forEach((width, i) => {
    const text = cells[i]!;
    output.push(' ', text, ' '.repeat(width - text.length + 1), '│');
  });
};

/**
 * Build a Unicode box-drawing table from column arrays.
 *
 * ```
 * ┌──────┬───────┐
 * │ Name │ Score │
 * ├──────┼───────┤
 * │ Foo  │ 1000  │
 * │ Bar  │ 2000  │
 * └──────┴───────┘
 * ```
 */
export const buildTable = (...columns: string[][]): string => {
  const maxWidths = columns.map((col) =>
    col.reduce((max, str) => (max > str.length ? max : str.length), 0),
  );

  const output: string[] = [];

  appendBorderLine(output, maxWidths, '┌', '┬', '┐');
  output.push('\n');

  let row = 0;
  const cells: string[] = [];
  for (const col of columns) cells.push(col[row]!);
  appendDataRow(output, maxWidths, cells.splice(0));
  output.push('\n');

  appendBorderLine(output, maxWidths, '├', '┼', '┤');
  output.push('\n');

  ++row;
  do {
    for (const col of columns) cells.push(col[row]!);
    appendDataRow(output, maxWidths, cells.splice(0));
    output.push('\n');
  } while (++row < columns[0]!.length);

  appendBorderLine(output, maxWidths, '└', '┴', '┘');

  return output.join('');
};