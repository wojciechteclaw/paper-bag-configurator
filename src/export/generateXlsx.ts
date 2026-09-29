// Thin exceljs adapter: writes a `WorkbookModel` into an .xlsx buffer. exceljs is loaded lazily (dynamic import),
// so it stays out of the main bundle. Works in the browser and in Node (tests / scripts).

import { cellValue, type Cell, type WorkbookModel } from './workbookModel';

const HEADER_FILL = 'FF2F4F4F';
const HEADER_FONT = 'FFFFFFFF';
const TITLE_FONT = 'FF2F4F4F';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6)}`;

/** Black or white text on a `#rrggbb` fill, whichever reads better. */
function contrastText(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(n)) return 'FF000000';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'FF000000' : 'FFFFFFFF';
}

export async function buildXlsxBuffer(model: WorkbookModel): Promise<ArrayBuffer> {
  const module = await import('exceljs');
  const ExcelJS = (module as unknown as { default?: typeof module }).default ?? module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Paper bag configurator';
  workbook.title = model.title;
  workbook.created = new Date();

  for (const sheet of model.sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    const widths: number[] = [];
    let rowIndex = 1;

    sheet.blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) rowIndex += 1;
      if (block.title) {
        const title = ws.getRow(rowIndex++);
        title.getCell(1).value = block.title;
        title.getCell(1).font = { bold: true, size: 12, color: { argb: TITLE_FONT } };
      }
      const header = ws.getRow(rowIndex++);
      block.columns.forEach((column, c) => {
        const cell = header.getCell(c + 1);
        cell.value = column.header;
        cell.font = { bold: true, color: { argb: HEADER_FONT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'thin' } };
        widths[c] = Math.max(widths[c] ?? 0, column.width ?? 12);
      });
      if (blockIndex === 0 && !block.title) ws.views = [{ state: 'frozen', ySplit: rowIndex - 1 }];

      for (const cells of block.rows) {
        const row = ws.getRow(rowIndex++);
        cells.forEach((cell: Cell, c) => {
          const target = row.getCell(c + 1);
          target.value = cellValue(cell);
          const numFmt = block.columns[c]?.numFmt;
          if (numFmt && typeof target.value === 'number') target.numFmt = numFmt;
          if (cell !== null && typeof cell === 'object') {
            if (cell.fill) {
              target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(cell.fill) } };
              target.font = { color: { argb: contrastText(cell.fill) }, bold: cell.bold };
            } else if (cell.bold) {
              target.font = { bold: true };
            }
          }
        });
      }
    });

    widths.forEach((width, c) => {
      ws.getColumn(c + 1).width = width;
    });
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
