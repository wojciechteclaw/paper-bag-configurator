import { describe, expect, it } from 'vitest';
import { getBottomAllowance } from '../../../src/domain/geometry/tube';
import { getAllowanceForOverlap, getBottomFlapGeometry, validateBottomFlaps } from '../../../src/domain/validation/bottom';

describe('bottom-forming conditions (client spec: E = (OV + D)/2, E ≥ D/2, OV > 0)', () => {
  it('derives E and OV like the client example (D = 150 → E = 90, OV = 30, apex 75)', () => {
    expect(getAllowanceForOverlap(150)).toBe(90);
    expect(getAllowanceForOverlap(150, 30)).toBe(getBottomAllowance({ depth: 150 }));
    expect(getBottomFlapGeometry(150)).toEqual({ allowance: 90, overlap: 30, apexDepth: 75 });
  });

  it('accepts the client rule for every catalogue depth', () => {
    for (let depth = 40; depth <= 300; depth += 5) expect(validateBottomFlaps(depth)).toEqual([]);
  });

  it('flags an allowance shorter than the triangle apex (E < D/2) and a missing overlap (OV ≤ 0)', () => {
    expect(validateBottomFlaps(150, 70)).toEqual(['ALLOWANCE_BELOW_HALF_DEPTH', 'NO_FLAP_OVERLAP']);
    // E = D/2 exactly: the apex just fits, but the flaps only meet edge to edge — nothing to glue.
    expect(validateBottomFlaps(150, 75)).toEqual(['NO_FLAP_OVERLAP']);
    expect(validateBottomFlaps(150, 75.5)).toEqual([]);
  });

  it('reports non-finite input as invalid', () => {
    expect(validateBottomFlaps(Number.NaN)).toHaveLength(2);
    expect(validateBottomFlaps(150, Number.POSITIVE_INFINITY)).toHaveLength(2);
  });
});
