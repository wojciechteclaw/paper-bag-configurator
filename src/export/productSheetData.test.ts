import { describe, expect, it } from 'vitest';
import { getHandlePatchSize } from '../domain/dieline';
import { fitToBox, formatScaleNote, buildProductSheetData } from './productSheetData';
import { exportContext, sampleConfiguration, sampleCoverage, sampleDieline, samplePalette } from './testFixtures';

const configuration = sampleConfiguration();
const dieline = sampleDieline(configuration);

const rowValue = (data: ReturnType<typeof buildProductSheetData>, id: string) =>
  data.parameters.sections.flatMap((s) => s.rows).find((r) => r.id === id);

describe('buildProductSheetData (PL)', () => {
  const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('pl'), samplePalette());

  it('names the file and the sheet after type and W × H × D', () => {
    expect(data.fileBaseName).toBe('torba-klockowa-200x400x150');
    expect(data.title).toBe('Karta produktu');
    expect(data.subtitle).toBe('Torba klockowa 200 × 400 × 150 mm');
  });

  it('has all parameter sections in order', () => {
    expect(data.parameters.sections.map((s) => s.id)).toEqual(['product', 'paper', 'handle', 'construction', 'print', 'artwork']);
  });

  it('lists dimensions, paper, handle, construction and print with units', () => {
    expect(rowValue(data, 'width')).toMatchObject({ value: 200, unit: 'mm', label: 'Szerokość (W)' });
    expect(rowValue(data, 'height')).toMatchObject({ value: 400, unit: 'mm' });
    expect(rowValue(data, 'depth')).toMatchObject({ value: 150, unit: 'mm' });
    expect(rowValue(data, 'paperType')?.value).toBe('Kraft');
    expect(rowValue(data, 'paperColor')?.value).toBe('Brązowy');
    expect(rowValue(data, 'grammage')).toMatchObject({ value: 80, unit: 'g/m²' });
    expect(rowValue(data, 'fsc')?.value).toBe('nie');
    expect(rowValue(data, 'moistureBarrier')?.value).toBe('nie');
    expect(rowValue(data, 'handleVariant')?.value).toBe('Wewnętrzny, papier skręcany');
    expect(rowValue(data, 'ropeDiameter')).toMatchObject({ value: 5, unit: 'mm' });
    expect(rowValue(data, 'patchWidth')).toMatchObject({ value: getHandlePatchSize(configuration.handle!, 200).width, unit: 'mm' });
    expect(rowValue(data, 'bottomAllowance')).toMatchObject({ value: 90, unit: 'mm' });
    expect(rowValue(data, 'glueFlap')).toMatchObject({ value: 10, unit: 'mm' });
    expect(rowValue(data, 'sheetWidth')).toMatchObject({ value: 710, unit: 'mm' });
    expect(rowValue(data, 'sheetHeight')).toMatchObject({ value: 490, unit: 'mm' });
    expect(rowValue(data, 'sheetArea')).toMatchObject({ value: 3479, unit: 'cm²' });
    expect(rowValue(data, 'printTechnology')?.value).toBe('Fleksografia');
    expect(rowValue(data, 'colorCount')?.value).toBe(2);
    expect(rowValue(data, 'packaging')?.value).toBe('Karton');
    expect(rowValue(data, 'artworkFRONT')?.value).toBe('przód.png');
    expect(rowValue(data, 'artworkLEFT')?.value).toBe('brak');
  });

  it('has no quantity anywhere', () => {
    const text = JSON.stringify(data).toLowerCase();
    expect(text).not.toMatch(/quantity|nakład|naklad|szt\./);
    expect(data.parameters.sections.flatMap((s) => s.rows.map((r) => r.id))).not.toContain('quantity');
  });

  it('lists Pantone colours with swatch, % of sheet and area, plus the total', () => {
    expect(data.pantone.rows).toHaveLength(2);
    expect(data.pantone.rows[0]).toMatchObject({ code: 'PMS 186 C', hex: '#c8102e' });
    expect(data.pantone.rows[0].percent.replace(/\s/g, '')).toBe('12,50%');
    expect(data.pantone.rows[0].area.replace(/\s/g, '')).toBe('434,9cm²');
    expect(data.pantone.total.percent.replace(/\s/g, '')).toBe('15,00%');
    expect(data.pantone.unassigned).toBeUndefined();
  });

  it('plans the 3D views: 4 × unfolded (every wall), 2 × 20 % and 2 × 100 % folded, labelled with view and fold', () => {
    const [unfolded, folded] = data.viewPages;
    expect(unfolded.title).toBe('Widoki 3D — torba rozłożona');
    expect(unfolded.views.map((v) => [v.foldProgress, v.angle])).toEqual([
      [0, 'FRONT_3_4'],
      [0, 'BACK_3_4'],
      [0, 'LEFT_3_4'],
      [0, 'RIGHT_3_4'],
    ]);
    expect(folded.title).toBe('Widoki 3D — torba złożona');
    expect(folded.views.map((v) => [v.foldProgress, v.angle])).toEqual([
      [0.2, 'FRONT_3_4'],
      [0.2, 'BACK_3_4'],
      [1, 'FRONT'],
      [1, 'BACK'],
    ]);
    const compact = (text: string) => text.replace(/\s/g, '');
    expect(compact(unfolded.views[2].caption)).toBe('Lewybok3/4·złożenie0%');
    expect(compact(folded.views[0].caption)).toBe('Przód3/4·złożenie20%');
    expect(compact(folded.views[3].caption)).toBe('Tył·złożenie100%');
    expect(new Set([...unfolded.views, ...folded.views].map((v) => v.id)).size).toBe(8);
  });

  it('lists the artwork colours (HEX) by area with nearest Pantone, other shades and the total', () => {
    const table = data.artworkColors;
    const compact = (text: string | undefined) => text?.replace(/\s/g, '');
    expect(table.title).toBe('Kolory w grafikach (HEX) — powierzchnia per kolor');
    expect(table.headers).toEqual({ swatch: 'Kolor', hex: 'HEX', pantone: 'Pantone (najbliższy)', area: 'Powierzchnia [cm²]', percent: '% arkusza' });
    expect(table.rows.map((r) => r.hex)).toEqual(['#c8102e', '#1f1f1f']);
    expect(table.rows[1].pantone).toBe('Black C (ΔE 6)');
    expect(compact(table.rows[0].area)).toBe('430cm²');
    expect(compact(table.rows[0].percent)).toBe('12,36%');
    expect(table.other?.label).toBe('inne (pozostałe odcienie: 3)');
    expect(compact(table.other?.area)).toBe('6,9cm²');
    expect(compact(table.total.area)).toBe('521,9cm²');
    expect(compact(table.total.percent)).toBe('15,00%');
  });

  it('lists the colour-merge settings in the parameters and notes them under the colour table', () => {
    expect(rowValue(data, 'colorMergeTolerance')).toMatchObject({ value: 10, label: 'Łączenie podobnych kolorów grafik (ΔE00)' });
    expect(rowValue(data, 'colorMinAreaShare')).toMatchObject({ value: 0.5, unit: '%' });
    const [method, merged] = data.artworkColors.notes;
    expect(method).toContain('ΔE00 10');
    expect(method.replace(/\s/g, '')).toContain('0,5%farby');
    expect(merged).toBe('42 odcienie połączono w 2 kolory');
  });
});

describe('buildProductSheetData edge cases', () => {
  it('shows dashes and a note without a coverage result', () => {
    const data = buildProductSheetData(configuration, null, dieline, exportContext('pl'));
    expect(data.pantone.rows[0].percent).toBe('—');
    expect(data.pantone.total.area).toBe('—');
    expect(data.pantone.notes[0]).toMatch(/pokrycia/);
    expect(data.artworkColors.rows).toEqual([]);
    expect(data.artworkColors.total.area).toBe('—');
    expect(data.artworkColors.notes).toEqual(['Nie udało się wykryć kolorów grafik.']);
  });

  it('shows unassigned ink and a hint without Pantone colours', () => {
    const bare = { ...configuration, print: { ...configuration.print, pantoneColors: [] } };
    const coverage = { ...sampleCoverage(), colors: [], unassignedArea: 1000, unassignedSheetRatio: 1000 / (710 * 490) };
    const data = buildProductSheetData(bare, coverage, dieline, exportContext('en'));
    expect(data.pantone.rows).toEqual([]);
    expect(data.pantone.unassigned?.label).toBe('no assigned colour');
    expect(data.pantone.notes).toContain('No Pantone colours — coverage is given as a total only.');
  });

  it('localizes to English', () => {
    const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('en'));
    expect(data.fileBaseName).toBe('block-bottom-bag-200x400x150');
    expect(data.subtitle).toBe('Block-bottom bag 200 × 400 × 150 mm');
    expect(data.pantone.rows[0].percent).toBe('12.50%');
    expect(data.viewPages[1].title).toBe('3D views — folded bag');
    expect(data.viewPages[1].views[2].caption).toBe('Front · 100% folded');
    expect(data.artworkColors.headers.pantone).toBe('Pantone (nearest)');
  });

  it('has no handle details for a bag without a handle', () => {
    const data = buildProductSheetData({ ...configuration, handle: null }, null, dieline, exportContext('pl'));
    const handle = data.parameters.sections.find((s) => s.id === 'handle')!;
    expect(handle.rows.map((r) => r.id)).toEqual(['handleVariant']);
    expect(handle.rows[0].value).toBe('Bez uchwytu');
  });
});

describe('dieline page fit', () => {
  it('fits the drawing into the box and reports the scale', () => {
    const fit = fitToBox(752, 532, 267, 158);
    expect(fit.scale).toBeCloseTo(158 / 532);
    expect(fit.height).toBeCloseTo(158);
    expect(fit.width).toBeLessThanOrEqual(267);
    expect(fitToBox(100, 50, 267, 158).scale).toBe(1);
    expect(formatScaleNote(0.25, exportContext('pl'))).toBe('skala 1:4 (wymiary w mm)');
    expect(formatScaleNote(1 / 3.37, exportContext('en'))).toBe('scale 1:3.4 (dimensions in mm)');
  });
});

describe('buildProductSheetData (DE)', () => {
  const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('de'), samplePalette());
  const compact = (text?: string) => text?.replace(/\s/g, '');

  it('uses German titles, labels and file name', () => {
    expect(data.fileBaseName).toBe('blockbodenbeutel-200x400x150');
    expect(data.title).toBe('Produktdatenblatt');
    expect(data.subtitle).toBe('Blockbodenbeutel 200 × 400 × 150 mm');
    expect(rowValue(data, 'width')).toMatchObject({ value: 200, unit: 'mm', label: 'Breite (B)' });
    expect(rowValue(data, 'handleVariant')?.value).toBe('Innenliegend, Papierkordel (gedreht)');
    expect(data.pantone.headers).toMatchObject({ code: 'Pantone-Code / Vorschau', percent: '% des Bogens' });
  });

  it('formats numbers with a decimal comma', () => {
    expect(compact(data.pantone.rows[0].percent)).toBe('12,50%');
    expect(compact(data.pantone.rows[0].area)).toBe('434,9cm²');
    expect(formatScaleNote(1 / 3.37, exportContext('de'))).toBe('Maßstab 1:3,4 (Maße in mm)');
  });
});
