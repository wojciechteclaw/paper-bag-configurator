import { describe, expect, it } from 'vitest';
import { createWrapLayer } from '../../src/domain/factories';
import { exportContext, sampleConfiguration, sampleCoverage, sampleDieline, samplePalette } from './testFixtures';
import { buildWorkbookModel, cellValue, type WorkbookModel } from '../../src/export/workbookModel';

const configuration = sampleConfiguration();
const dieline = sampleDieline(configuration);
const model = buildWorkbookModel(configuration, sampleCoverage(), dieline, exportContext('pl'), samplePalette());

const sheet = (m: WorkbookModel, id: string) => m.sheets.find((s) => s.id === id)!;
const block = (m: WorkbookModel, sheetId: string, blockId: string) => sheet(m, sheetId).blocks.find((b) => b.id === blockId)!;
const values = (row: Parameters<typeof cellValue>[0][]) => row.map(cellValue);

describe('buildWorkbookModel', () => {
  it('has the five sheets with valid Excel names (PL and EN)', () => {
    expect(model.sheets.map((s) => s.name)).toEqual(['Parametry', 'Ścianki i grafiki', 'Pantone i pokrycie', 'Kolory w grafikach', 'Wykrój']);
    const en = buildWorkbookModel(configuration, null, dieline, exportContext('en'));
    expect(en.sheets.map((s) => s.name)).toEqual(['Parameters', 'Panels & artwork', 'Pantone & coverage', 'Artwork colours', 'Dieline']);
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

  it('lists every whole-bag layer (bottom → top) with the wrap size and its own placement in the wrap layout', () => {
    const wrap = structuredClone(configuration);
    wrap.artworkLayout = 'WRAP';
    const base = wrap.panels.FRONT.artwork!;
    wrap.wrapLayers = [
      createWrapLayer({ ...base, id: 'bg', fileName: 'tło.png' }, { mode: 'FILL', extendToBottom: true }),
      createWrapLayer(
        { ...base, id: 'logo', fileName: 'logo.png' },
        { mode: 'CUSTOM', offsetX: -250, offsetY: 10, scale: 0.5, rotation: 0, extendToBottom: false },
      ),
    ];
    const rows = block(buildWorkbookModel(wrap, null, dieline, exportContext('pl')), 'panels', 'panels').rows.map(values);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['Cała torba — warstwa 1', 700, 400, 'tło.png', 2000, 4000, 'wypełnij ściankę', null, null, null, null, 'tak', 490]);
    expect(rows[1]).toEqual(['Cała torba — warstwa 2', 700, 400, 'logo.png', 2000, 4000, 'własne położenie', -250, 10, 0.5, 0, 'nie', 400]);
  });

  it('lists whole-sheet layers with the sheet size and the layout "cały arkusz" (parameters and panels sheets)', () => {
    const sheet = structuredClone(configuration);
    sheet.artworkLayout = 'SHEET';
    sheet.sheetLayers = [createWrapLayer({ ...sheet.panels.FRONT.artwork!, id: 'sheet', fileName: 'arkusz.png' }, { mode: 'FILL', extendToBottom: true })];
    const model = buildWorkbookModel(sheet, null, dieline, exportContext('pl'));
    const params = block(model, 'parameters', 'parameters').rows.map(values);
    expect(params).toContainEqual(['Grafiki', 'Układ grafik', 'Grafika na cały arkusz (wykrój)', null]);
    expect(params).toContainEqual(['Grafiki', 'Cały arkusz — warstwa 1', 'arkusz.png — rozciągnięta na arkusz (bez zakładki klejowej)', null]);
    const rows = block(model, 'panels', 'panels').rows.map(values);
    expect(rows).toHaveLength(1);
    // 200 × 400 × 150 block bag: sheet 710 × 490 mm; the layer area is the walls 700 × 490 mm (no glue flap; allowance
    // included — not added twice).
    expect(rows[0]).toEqual(['Cały arkusz — warstwa 1', 700, 490, 'arkusz.png', 2000, 4000, 'wypełnij ściankę', null, null, null, null, 'tak', 490]);
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

  it('has an artwork colour sheet: swatch fill, HEX, nearest Pantone, area and shares, then other and total', () => {
    const colors = block(model, 'colors', 'artwork-colors');
    expect(colors.title).toBe('Kolory w grafikach (HEX) — powierzchnia per kolor');
    expect(colors.columns.map((c) => c.header)).toEqual([
      'Kolor',
      'HEX',
      'Pantone (najbliższy)',
      'ΔE do Pantone',
      'Powierzchnia farby [cm²]',
      'Pokrycie arkusza [%]',
      'Udział w farbie [%]',
    ]);
    expect(colors.rows[0]).toEqual([{ value: null, fill: '#c8102e' }, '#c8102e', 'PMS 186 C', 0, 430, 43000 / (710 * 490), 43000 / 52185]);
    expect(values(colors.rows[1]).slice(1, 5)).toEqual(['#1f1f1f', 'Black C', 6, 85]);
    expect(values(colors.rows[2]).slice(1, 5)).toEqual(['inne (pozostałe odcienie: 3)', null, null, 6.9]);
    expect(values(colors.rows[3])).toEqual([null, 'Łącznie', null, null, 521.9, 52185 / (710 * 490), 1]);
    const notes = block(model, 'colors', 'artwork-colors-notes').rows.map(values);
    expect(notes[0][1]).toContain('ΔE00 10');
    expect(notes[1]).toEqual(['Uwaga', '42 odcienie połączono w 2 kolory']);
    const params = block(model, 'parameters', 'parameters').rows.map(values);
    expect(params).toContainEqual(['Nadruk i pakowanie', 'Łączenie podobnych kolorów grafik (ΔE00)', 10, null]);
    const empty = buildWorkbookModel(configuration, null, dieline, exportContext('en'));
    expect(block(empty, 'colors', 'artwork-colors').rows).toEqual([]);
    expect(values(block(empty, 'colors', 'artwork-colors-notes').rows[0])[1]).toBe('Artwork colours could not be detected.');
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
    // One row per cut-outline edge (the glue flap is chamfered at both ends → 6 edges) and per crease.
    const cutEdges = dieline.cuts.reduce((count, polygon) => count + polygon.length, 0);
    expect(lines.rows).toHaveLength(cutEdges + dieline.creases.length);
    expect(values(lines.rows[0])).toEqual(['cut-1-1', 'cięcie', null, 'obrys arkusza', 0, 0, 700, 0, 700]);
    const c1 = lines.rows.map(values).find((r) => r[2] === 'C1')!;
    expect(c1.slice(1, 4)).toEqual(['big', 'C1', 'linia dna']);
    expect(block(model, 'dieline', 'patches').rows).toHaveLength(2);
  });
});

describe('buildXlsxBuffer', () => {
  it('writes a workbook exceljs can read back with the same sheets and styled headers', { timeout: 30000 }, async () => {
    const { buildXlsxBuffer } = await import('../../src/export/generateXlsx');
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
    const colors = workbook.getWorksheet('Kolory w grafikach')!;
    expect(colors.getCell('B3').value).toBe('#c8102e');
    expect((colors.getCell('A3').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFC8102E');
  });
});

describe('buildWorkbookModel (DE)', () => {
  const de = buildWorkbookModel(configuration, sampleCoverage(), dieline, exportContext('de'), samplePalette());

  it('uses German sheet names, headers, labels and file name', () => {
    expect(de.fileBaseName).toBe('blockbodenbeutel-200x400x150');
    expect(de.sheets.map((s) => s.name)).toEqual(['Parameter', 'Wände & Druckmotive', 'Pantone & Farbdeckung', 'Motivfarben', 'Stanzkontur']);
    for (const s of de.sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[\\/?*[\]:]/);
    }
    const parameters = block(de, 'parameters', 'parameters');
    expect(parameters.columns.map((c) => c.header)).toEqual(['Bereich', 'Parameter', 'Wert', 'Einheit']);
    const rows = parameters.rows.map(values);
    expect(rows).toContainEqual(['Produkt', 'Breite (B)', 200, 'mm']);
    expect(rows).toContainEqual(['Papier', 'Grammatur', 80, 'g/m²']);
    expect(rows).toContainEqual(['Konstruktion & Bogen', 'Bodenzugabe (T + 30) / 2', 90, 'mm']);
    expect(block(de, 'panels', 'panels').columns.map((c) => c.header)).toContain('Drehung [°]');
    expect(block(de, 'coverage', 'pantone').columns.map((c) => c.header)).toEqual([
      'Pantone-Code',
      'Vorschau-HEX',
      'Deckung des Bogens [%]',
      'Farbfläche [mm²]',
    ]);
  });
});
