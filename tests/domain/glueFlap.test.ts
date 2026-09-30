import { describe, expect, it } from 'vitest';
import { getBagWeight } from '../../src/domain/bagWeight';
import { buildDieline } from '../../src/domain/dieline';
import { createConfiguration } from '../../src/domain/factories';
import { constrainGlueFlapWidth, getGlueFlapWidth } from '../../src/domain/glueFlap';

describe('glue flap width', () => {
  it('defaults per bag type and reads older data without the field', () => {
    expect(createConfiguration('BLOCK').glueFlapWidth).toBe(10);
    expect(getGlueFlapWidth({ productType: 'BLOCK' })).toBe(10);
    expect(getGlueFlapWidth({ productType: 'FOLDED' })).toBe(15);
    expect(getGlueFlapWidth({ productType: 'BLOCK', glueFlapWidth: 17 })).toBe(17);
  });

  it('is clamped to 10–20 mm in whole mm', () => {
    expect(constrainGlueFlapWidth(25, 'BLOCK', 10)).toBe(20);
    expect(constrainGlueFlapWidth(4, 'BLOCK', 10)).toBe(10);
    expect(constrainGlueFlapWidth(12.4, 'BLOCK', 10)).toBe(12);
    expect(constrainGlueFlapWidth(Number.NaN, 'BLOCK', 14)).toBe(14);
  });

  it('drives the dieline (sheet width 2W + 2D + s) and the bag weight', () => {
    const base = createConfiguration('BLOCK');
    const wide = { ...base, glueFlapWidth: 20 };
    expect(buildDieline(base).sheet.width).toBe(2 * 200 + 2 * 150 + 10);
    expect(buildDieline(wide).sheet.width).toBe(2 * 200 + 2 * 150 + 20);
    expect(buildDieline(wide).glueFlapWidth).toBe(20);
    expect(getBagWeight(wide).grams).toBeGreaterThan(getBagWeight(base).grams);
  });
});
