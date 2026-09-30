import { describe, expect, it } from 'vitest';
import { getBagWeight } from '../../src/domain/bagWeight';
import { constrainBottomFold, getConfiguredBottomFold } from '../../src/domain/bottomFold';
import { buildDieline } from '../../src/domain/dieline';
import { createConfiguration } from '../../src/domain/factories';

describe('bottom strip d (gusseted bag)', () => {
  it('defaults to 25 mm for the gusseted bag and is absent for the block-bottom bag', () => {
    expect(createConfiguration('FOLDED').bottomFoldDepth).toBe(25);
    expect(createConfiguration('BLOCK').bottomFoldDepth).toBeUndefined();
    expect(getConfiguredBottomFold({ productType: 'FOLDED' })).toBe(25);
    expect(getConfiguredBottomFold({ productType: 'BLOCK', bottomFoldDepth: 20 })).toBeUndefined();
  });

  it('is clamped to 15–30 mm in whole mm', () => {
    expect(constrainBottomFold(40, 'FOLDED', 25)).toBe(30);
    expect(constrainBottomFold(5, 'FOLDED', 25)).toBe(15);
    expect(constrainBottomFold(18.6, 'FOLDED', 25)).toBe(19);
    expect(constrainBottomFold(Number.NaN, 'FOLDED', 22)).toBe(22);
    expect(constrainBottomFold(20, 'BLOCK', undefined)).toBeUndefined();
  });

  it('drives the cut length L = H + d and the bag weight', () => {
    const base = { ...createConfiguration('FOLDED'), dimensions: { width: 150, height: 250, depth: 60 } };
    const longer = { ...base, bottomFoldDepth: 30 };
    expect(buildDieline(base).sheet.height).toBe(250 + 25);
    expect(buildDieline(longer).sheet.height).toBe(250 + 30);
    expect(buildDieline(longer).allowance).toBe(30);
    expect(getBagWeight(longer).grams).toBeGreaterThan(getBagWeight(base).grams);
  });
});
