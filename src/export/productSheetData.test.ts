import { describe, expect, it } from 'vitest';
import { getHandlePatchSize } from '../domain/dieline';
import { fitToBox, formatScaleNote, buildProductSheetData } from './productSheetData';
import { exportContext, sampleConfiguration, sampleCoverage, sampleDieline } from './testFixtures';

const configuration = sampleConfiguration();
const dieline = sampleDieline(configuration);

const rowValue = (data: ReturnType<typeof buildProductSheetData>, id: string) =>
  data.parameters.sections.flatMap((s) => s.rows).find((r) => r.id === id);

describe('buildProductSheetData (PL)', () => {
  const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('pl'));

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

  it('plans the 3D views: box and standing from both angles, then the folding options', () => {
    const [views, folding] = data.viewPages;
    expect(views.title).toBe('Widoki 3D');
    expect(views.views.map((v) => [v.foldProgress, v.angle])).toEqual([
      [0, 'FRONT_3_4'],
      [0, 'BACK_3_4'],
      [0.25, 'FRONT_3_4'],
      [0.25, 'BACK_3_4'],
    ]);
    expect(folding.title).toBe('Opcje złożonej torby');
    expect(folding.views.map((v) => v.foldProgress)).toEqual([0.5, 0.75, 1, 1]);
    expect(folding.views[2].caption).toBe('Złożona na płasko — przód 3/4');
    expect(new Set([...views.views, ...folding.views].map((v) => v.id)).size).toBe(8);
  });
});

describe('buildProductSheetData edge cases', () => {
  it('shows dashes and a note without a coverage result', () => {
    const data = buildProductSheetData(configuration, null, dieline, exportContext('pl'));
    expect(data.pantone.rows[0].percent).toBe('—');
    expect(data.pantone.total.area).toBe('—');
    expect(data.pantone.notes[0]).toMatch(/pokrycia/);
  });

  it('shows unassigned ink and a hint without Pantone colours', () => {
    const bare = { ...configuration, print: { technology: 'FLEXO' as const, pantoneColors: [] } };
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
    expect(data.viewPages[1].title).toBe('Folded bag options');
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
