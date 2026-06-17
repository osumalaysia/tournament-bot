import type { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

type CellValue = string | number | boolean | null;

const COLUMN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const formatRow = (offset: number, char: string = COLUMN_CHARS): string => {
  if (typeof offset !== 'number') throw new TypeError('offset should be a number');
  const base = char.length;
  const output: number[] = [offset % base];
  for (let remain = Math.floor(offset / base); remain--; ) {
    output.unshift(remain % base);
    remain = Math.floor(remain / base);
  }
  return output.map((n) => char[n]).join('');
};

const formatXY = (x: number, y: number, width: number = 1, height: number = 1): string =>
  `${formatRow(x)}${y + 1}:${formatRow(x + width - 1)}${y + height}`;

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
    await sheet.loadCells(formatXY(x, offsetY, more, preload));
    for (let amount = preload; amount; --amount, ++offsetY) {
      const current: CellValue[] = [];
      let offsetX = x;
      current.push(sheet.getCell(offsetY, offsetX).value as CellValue);
      if (current[0] === null) return output;
      for (let amount = more; --amount; ) {
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
    (max, current) => (current.length > max ? current.length : max),
    0,
  );
  if (!ySize || !xSize) return;
  await sheet.loadCells(formatXY(x, y, xSize, ySize));
  data.forEach((list, xIndex) => {
    const xOffset = x + +xIndex;
    list.forEach((value, yIndex) => {
      try {
        const yOffset = y + +yIndex;
        const cell = sheet.getCell(yOffset, xOffset);
        if (cell.value === value) return;
        cell.value = value as string | number | boolean;
      } catch (_err) {
        // console.log(`Failed to assign value (${value}): ${err.stack}`);
      }
    });
  });
};

// --- Table building utilities ---

const buildLine = (
  output: string[],
  sizes: number[],
  start: string,
  mid: string,
  end: string,
): void => {
  if (!sizes.length) return;
  output.push(start);
  sizes.forEach((size, index, arr) => {
    output.push('─'.repeat(2 + size));
    output.push(index === arr.length - 1 ? end : mid);
  });
};

const buildString = (
  output: string[],
  sizes: number[],
  data: string[],
): void => {
  if (!sizes.length) return;
  const char = '│';
  output.push(char);
  sizes.forEach((size, index) => {
    const string = data[index]!;
    output.push(' ', string, ' '.repeat(size - string.length + 1), char);
  });
};

export const buildTable = (...columns: string[][]): string => {
  //─│┌┬┐├┼┤└┴┘
  const maxSizes = columns.map((column) =>
    column.reduce((max, string) => (max > string.length ? max : string.length), 0),
  );
  const output: string[] = [];
  buildLine(output, maxSizes, '┌', '┬', '┐');
  output.push('\n');
  let at = 0;
  const row: string[] = [];
  for (const index in columns) row.push(columns[index]![at]!);
  buildString(output, maxSizes, row.splice(0));
  output.push('\n');
  buildLine(output, maxSizes, '├', '┼', '┤');
  output.push('\n');
  ++at;
  do {
    for (const index in columns) row.push(columns[index]![at]!);
    buildString(output, maxSizes, row.splice(0));
    output.push('\n');
  } while (++at < columns[0]!.length);
  buildLine(output, maxSizes, '└', '┴', '┘');
  return output.join('');
};