import { describe, expect, it } from 'vitest';
import { buildDieline } from '../../src/domain/dieline';
import { createConfiguration } from '../../src/domain/factories';
import { exportFileBaseName } from '../../src/export/format';
import { buildParameterSections } from '../../src/export/parameters';
import { buildProductSheetData } from '../../src/export/productSheetData';
import { exportContext, sampleCoverage, samplePalette } from './testFixtures';

// Export of the gusseted-bag bag (FOLDED): client notation W + F × H [K], gusset / strip / seam wording, the FOLDED blank.
describe('gusseted-bag bag export', () => {
  const configuration = createConfiguration('FOLDED'); // client example 140 + 90 × 370
  const dieline = buildDieline(configuration);
  const rows = (language: 'pl' | 'en' | 'de') =>
    buildParameterSections(configuration, dieline, exportContext(language).t).flatMap((section) => section.rows);
  const row = (language: 'pl' | 'en' | 'de', id: string) => rows(language).find((r) => r.id === id);

  it('names the type, the gusset F, the bottom strip d, the seam s and the print area W × (H − d)', () => {
    expect(row('pl', 'productType')?.value).toBe('Torba fałdowa');
    expect(row('pl', 'depth')).toMatchObject({ label: 'Fałda (F)', value: 90, unit: 'mm' });
    expect(row('pl', 'bottomAllowance')).toMatchObject({ label: 'Pas dna (d)', value: 25 });
    expect(row('pl', 'glueFlap')).toMatchObject({ label: 'Zakładka szwu (s)', value: 15 });
    expect(row('pl', 'printArea')).toMatchObject({ label: 'Pole nadruku (na stronę)', value: '140 × 345', unit: 'mm' });
    expect(row('en', 'depth')?.label).toBe('Gusset (F)');
    expect(row('de', 'bottomAllowance')?.label).toBe('Bodenstreifen (d)');
    expect(row('pl', 'sheetWidth')?.value).toBe(475);
    expect(row('pl', 'sheetHeight')?.value).toBe(395);
    expect(row('pl', 'handleVariant')?.value).toBe('Bez uchwytu');
  });

  it('writes the size as W + F × H in the file name and the product sheet title', () => {
    expect(exportFileBaseName(configuration, exportContext('pl').t)).toBe('torba-faldowa-140+90x370');
    const data = buildProductSheetData(configuration, sampleCoverage(), dieline, exportContext('pl'), samplePalette());
    expect(data.subtitle).toBe('Torba fałdowa 140 + 90 × 370 mm');
    expect(data.dieline.svgTitle).toBe('Wykrój torby fałdowej 140 + 90 × 370 mm');
  });

  it('keeps the block-bottom notation and has no print-area row for the block bottom', () => {
    const block = createConfiguration('BLOCK');
    const blockRows = buildParameterSections(block, buildDieline(block), exportContext('pl').t).flatMap((s) => s.rows);
    expect(blockRows.some((r) => r.id === 'printArea')).toBe(false);
    expect(exportFileBaseName(block, exportContext('pl').t)).toBe('torba-klockowa-200x400x150');
  });
});
