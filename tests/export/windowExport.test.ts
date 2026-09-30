import { describe, expect, it } from 'vitest';
import { buildDieline } from '../../src/domain/dieline';
import { createConfiguration } from '../../src/domain/factories';
import type { BagConfiguration, BagWindow } from '../../src/domain/types';
import { buildParameterSections } from '../../src/export/parameters';
import { buildProductSheetData } from '../../src/export/productSheetData';
import { buildWorkbookModel } from '../../src/export/workbookModel';
import { exportContext, sampleCoverage, samplePalette } from './testFixtures';

// Window rows of the PDF / Excel parameter list (docs/SPEC.md §2b), gusseted 140 + 90 × 370.
const withWindow = (window: BagWindow | null): BagConfiguration => ({ ...createConfiguration('FOLDED'), window });
const section = (configuration: BagConfiguration, language: 'pl' | 'en' | 'de' = 'pl') =>
  buildParameterSections(configuration, buildDieline(configuration), exportContext(language).t).find((s) => s.id === 'window');

describe('window in the export parameters', () => {
  it('lists type, film, opening size and position, overlap, film size and area', () => {
    const rectangle = section(withWindow({ type: 'RECTANGLE', material: 'PP_PERFORATED', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 }));
    expect(rectangle?.title).toBe('Okienko');
    expect(rectangle?.rows.map((r) => [r.id, r.value, r.unit])).toEqual([
      ['windowType', 'Prostokątne', undefined],
      ['windowMaterial', 'folia PP perforowana', undefined],
      ['windowWidth', 60, 'mm'],
      ['windowHeight', 100, 'mm'],
      ['windowBottomOffset', 150, 'mm'],
      ['windowPosition', 'na środku przodu', undefined],
      ['windowFilmOverlap', 10, 'mm'],
      ['windowFilmSize', '80 × 120', 'mm'],
      ['windowFilmArea', 96, 'cm²'],
    ]);
  });

  it('derives the panoramic strip height and says it is open at the top', () => {
    const rows = section(withWindow({ type: 'PANORAMIC', material: 'CELLULOSE', width: 40, filmOverlap: 10 }), 'en')!.rows;
    const value = (id: string) => rows.find((r) => r.id === id)?.value;
    expect([value('windowType'), value('windowMaterial'), value('windowHeight'), value('windowBottomOffset')]).toEqual([
      'Panoramic (strip)',
      'cellulose film',
      330,
      40,
    ]);
    expect(value('windowPosition')).toBe('centred on the front, up to the mouth (open at the top)');
    expect(value('windowFilmArea')).toBe(204);
  });

  it('says "no window" for a gusseted bag without one and has no window section for the block bottom', () => {
    expect(section(withWindow(null), 'de')?.rows).toEqual([{ id: 'windowType', label: 'Sichtfenster', value: 'ohne Sichtfenster' }]);
    expect(section(createConfiguration('BLOCK'))).toBeUndefined();
  });

  it('names the window cut lines in the Excel dieline sheet and adds the film to the PDF legend', () => {
    const configuration = withWindow({ type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 });
    const dieline = buildDieline(configuration);
    const model = buildWorkbookModel(configuration, sampleCoverage(), dieline, exportContext('pl'), samplePalette());
    const lines = model.sheets.find((s) => s.id === 'dieline')!.blocks.find((b) => b.id === 'lines')!.rows;
    expect(lines.filter((r) => r[3] === 'wycięcie okienka')).toHaveLength(4);
    const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('pl'), samplePalette());
    expect(data.dieline.legend.windowFilm).toBe('folia okienka (wewnątrz, wsunięcie 10 mm)');
  });
});
