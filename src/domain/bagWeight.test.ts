import { describe, expect, it } from 'vitest';
import { getBagWeight } from './bagWeight';
import { createConfiguration } from './factories';

describe('getBagWeight', () => {
  const configuration = createConfiguration();
  const withSize = (grammage: number) => ({
    dimensions: { width: 200, height: 400, depth: 150 },
    paper: { ...configuration.paper, grammage },
  });

  it('weighs the cut blank: tube 700 × 490 mm + glue flap 10 mm with both ends chamfered at 45°', () => {
    // 700 · 490 + (10 · 490 − 2 · 10² / 2) = 343 000 + 4 800 mm².
    const { blankAreaM2, grams } = getBagWeight(withSize(100));
    expect(blankAreaM2).toBeCloseTo(0.3478, 9);
    expect(grams).toBeCloseTo(34.78, 9);
  });

  it('scales linearly with the grammage and ignores the handle', () => {
    expect(getBagWeight(withSize(50)).grams).toBeCloseTo(getBagWeight(withSize(100)).grams / 2, 9);
    expect(getBagWeight({ ...configuration, paper: { ...configuration.paper, grammage: 80 } }).grams).toBeCloseTo(
      getBagWeight({ dimensions: configuration.dimensions, paper: { ...configuration.paper, grammage: 80 } }).grams,
      9,
    );
  });
});
