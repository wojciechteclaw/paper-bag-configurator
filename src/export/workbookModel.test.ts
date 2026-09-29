import { describe, expect, it } from 'vitest';
import { exportContext, sampleConfiguration, sampleCoverage, sampleDieline } from './testFixtures';
import { buildWorkbookModel, cellValue, type WorkbookModel } from './workbookModel';

const configuration = sampleConfiguration();
const dieline = sampleDieline(configuration);
const model = buildWorkbookModel(configuration, sampleCoverage(), dieline, exportContext('pl'));

const sheet = (m: WorkbookModel, id: string) => m.sheets.find((s) => s.id === id)!;
const block = (m: WorkbookModel, sheetId: string, blockId: string) => sheet(m, sheetId).blocks.find((b) => b.id === blockId)!;
const values = (row: Parameters<typeof cellValue>[0][]) => row.map(cellValue);

describe('buildWorkbookModel', () => {
  it('has the four sheets with valid Excel names (PL and EN)', () => {
    expect(model.sheets.map((s) => s.name)).toEqual(['Parametry', 'Ścianki i grafiki', 'Pantone i pokrycie', 'Wykrój']);
    const en = buildWorkbookModel(configuration, null, dieline, exportContext('en'));
    expect(en.sheets.map((s) => s.name)).toEqual(['Parameters', 'Panels & artwork', 'Pantone & coverage', 'Dieline']);
    for (const s of [...model.sheets, ...en.sheets]) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[\\/?*[\]:]/);
    }
    expect(model.fileBaseName).toBe('torba-klockowa-200x400x150');
  });

  it('keeps numbers numeric with the unit in its own column on the parameters sheet', () => {
    const rows = block(model, 'parameters', 'parameters').rows.map(values);
    expect(rows).toContainEqual(['Produkt', 'Szerokość (W)', 200, 'mm']);
    expect(rows).toContainEqual(['Produkt', 'Wysokość (H)', 400, 'mm']);
    expect(rows).toContainEqual(['Produkt', 'Głębokość (D)', 150, 'mm']);
    expect(rows).toContainEqual(['Papier', 'Gramatura', 80, 'g/m²']);
    expect(rows).toContainEqual(['Konstrukcja i arkusz', 'Zapas na dno (D + 30) / 2', 90, 'mm']);
    expect(JSON.stringify(model).toLowerCase()).not.toMatch(/quantity|nakład|naklad/);
  });

  it('lists every panel with size, artwork and placement (units in headers)', () => {
    const panels = block(model, 'panels', 'panels');
    const headers = panels.columns.map((c) => c.header);
    expect(headers.slice(0, 6)).toEqual([
      'Ścianka',
      'Szerokość ścianki [mm]',
      'Wysokość ścianki [mm]',
      'Plik grafiki',
      'Szerokość obrazu [px]',
      'Wysokość obrazu [px]',
    ]);
    expect(headers).toContain('Obrót [°]');
    expect(headers).toContain('Rozciągnięcie na dno');
    const rows = panels.rows.map(values);
    expect(rows).toHaveLength(4);
    expect(rows[0].slice(0, 7)).toEqual(['Przednia', 200, 400, 'przód.png', 2000, 4000, 'wypełnij ściankę']);
    expect(rows[0].slice(7, 11)).toEqual([null, null, null, null]);
    expect(rows[1].slice(3, 13)).toEqual(['tył.png', 2000, 4000, 'własne położenie', 12.35, -8, 0.75, 90, 'tak', 490]);
    expect(rows[2].slice(0, 4)).toEqual(['Lewa', 150, 400, 'brak']);
  });

  it('omits the extend-to-bottom columns when placements do not carry the flag', () => {
    const legacy = structuredClone(configuration);
    for (const panel of Object.values(legacy.panels)) {
      delete (panel.placement as { extendToBottom?: boolean }).extendToBottom;
    }
    const headers = block(buildWorkbookModel(legacy, null, dieline, exportContext('pl')), 'panels', 'panels').columns.map((c) => c.header);
    expect(headers).not.toContain('Rozciągnięcie na dno');
  });

  it('has Pantone rows with swatch fill, % of sheet and mm², then total and unassigned', () => {
    const pantone = block(model, 'coverage', 'pantone');
    expect(pantone.columns.map((c) => c.header)).toEqual(['Kod Pantone', 'Podgląd HEX', 'Pokrycie arkusza [%]', 'Powierzchnia farby [mm²]']);
    expect(pantone.columns[2].numFmt).toBe('0.00%');
    expect(pantone.rows[0]).toEqual(['PMS 186 C', { value: '#c8102e', fill: '#c8102e' }, 0.125, 43488]);
    expect(values(pantone.rows[2])).toEqual(['Łącznie', null, 52185 / (710 * 490), 52185]);
    expect(values(pantone.rows[3])).toEqual(['bez przypisanego koloru', null, 0, 0]);
    const perPanel = block(model, 'coverage', 'panel-coverage').rows.map(values);
    expect(perPanel[0]).toEqual(['Przednia', 80000, 40000, 0.5]);
  });

  it('describes the dieline: sheet, columns with x ranges, and every cut and crease line', () => {
    expect(block(model, 'dieline', 'sheet').rows.map(values).slice(0, 4)).toEqual([
      ['Arkusz — szerokość', 710, 'mm'],
      ['Arkusz — wysokość', 490, 'mm'],
      ['Zapas na dno (D + 30) / 2', 90, 'mm'],
      ['Zakładka klejowa', 10, 'mm'],
    ]);
    const columns = block(model, 'dieline', 'columns').rows.map(values);
    expect(columns.map((r) => r.slice(0, 4))).toEqual([
      ['Bok lewy', 0, 150, 150],
      ['Przód', 150, 350, 200],
      ['Bok prawy', 350, 500, 150],
      ['Tył', 500, 700, 200],
      ['zakładka klejowa', 700, 710, 10],
    ]);
    const lines = block(model, 'dieline', 'lines');
    expect(lines.columns.map((c) => c.header)).toContain('x1 [mm]');
    expect(lines.rows).toHaveLength(4 + dieline.creases.length);
    expect(values(lines.rows[0])).toEqual(['cut-1-1', 'cięcie', null, 'obrys arkusza', 0, 0, 710, 0, 710]);
    const c1 = lines.rows.map(values).find((r) => r[2] === 'C1')!;
    expect(c1.slice(1, 4)).toEqual(['big', 'C1', 'linia dna']);
    expect(block(model, 'dieline', 'patches').rows).toHaveLength(2);
  });
});

describe('buildXlsxBuffer', () => {
  it('writes a workbook exceljs can read back with the same sheets and styled headers', { timeout: 30000 }, async () => {
    const { buildXlsxBuffer } = await import('./generateXlsx');
    const buffer = await buildXlsxBuffer(model);
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(model.sheets.map((s) => s.name));
    const params = workbook.getWorksheet('Parametry')!;
    expect(params.getCell('A1').value).toBe('Sekcja');
    expect(params.getCell('A1').font?.bold).toBe(true);
    expect(params.getCell('C2').value).toBe('Torba klockowa');
    const coverage = workbook.getWorksheet('Pantone i pokrycie')!;
    expect(coverage.getCell('A1').value).toBe('Kolory Pantone i pokrycie farbą');
    expect(coverage.getCell('C3').numFmt).toBe('0.00%');
  });
});
