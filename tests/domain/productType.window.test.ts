import { describe, expect, it } from 'vitest';
import { createConfiguration } from '../../src/domain/factories';
import { changeProductType } from '../../src/domain/productType';
import type { BagWindow } from '../../src/domain/types';

describe('changeProductType: window (docs/SPEC.md §2b)', () => {
  const window: BagWindow = { type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };

  it('removes the window when switching to the block bottom (no windows there)', () => {
    const folded = { ...createConfiguration('FOLDED'), window };
    const { configuration, adjustments } = changeProductType(folded, 'BLOCK');
    expect(configuration.window).toBeNull();
    expect(adjustments).toContainEqual({ field: 'window', removed: true });
  });

  it('keeps "no window" on the way to the gusseted bag and reports nothing about it', () => {
    const { configuration, adjustments } = changeProductType(createConfiguration('BLOCK'), 'FOLDED');
    expect(configuration.window).toBeNull();
    expect(adjustments.some((a) => a.field === 'window')).toBe(false);
  });
});
