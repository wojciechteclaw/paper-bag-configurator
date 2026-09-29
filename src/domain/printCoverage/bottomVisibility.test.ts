import { describe, expect, it } from 'vitest';
import { getDimensionWarnings, getMinTrapezoidWidth } from '../validation/bottom';
import { getVisibleBottomZoneArea, isBottomZonePointVisible } from './bottomVisibility';

const dims = { width: 200, height: 400, depth: 150 }; // E = 90

describe('bottom zone visibility (formed bottom seen from below, client model [K])', () => {
  it('shows the whole BACK trapezoid, the side triangles and the free part of the FRONT trapezoid', () => {
    expect(getVisibleBottomZoneArea('BACK', dims).area).toBeCloseTo(((200 + 20) / 2) * 90);
    expect(getVisibleBottomZoneArea('LEFT', dims).area).toBeCloseTo((150 * 75) / 2);
    const total = (['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const).reduce((sum, p) => sum + getVisibleBottomZoneArea(p, dims).area, 0);
    expect(total).toBeCloseTo(200 * 150); // exactly the W × D bottom
    expect(getVisibleBottomZoneArea('RIGHT', dims).share).toBeCloseTo((150 * 75) / 2 / (150 * 90));
  });

  it('hides the corner triangles and the side flap beyond the triangle', () => {
    expect(isBottomZonePointVisible('BACK', { x: 100, y: -80 }, dims)).toBe(true); // trapezoid
    expect(isBottomZonePointVisible('BACK', { x: 5, y: -80 }, dims)).toBe(false); // corner triangle (tucked in)
    expect(isBottomZonePointVisible('FRONT', { x: 5, y: -80 }, dims)).toBe(false);
    expect(isBottomZonePointVisible('LEFT', { x: 75, y: -40 }, dims)).toBe(true); // side triangle
    expect(isBottomZonePointVisible('LEFT', { x: 75, y: -85 }, dims)).toBe(false); // beyond the apex D/2
    expect(isBottomZonePointVisible('LEFT', { x: 75, y: 10 }, dims)).toBe(false); // wall, not the zone
  });
});

describe('BOTTOM_TRAPEZOID_DEGENERATE warning (W < D + 30, client decision pending)', () => {
  it('warns only below 2E = D + 30', () => {
    expect(getMinTrapezoidWidth(150)).toBe(180);
    expect(getDimensionWarnings({ width: 180, depth: 150 })).toEqual([]);
    expect(getDimensionWarnings({ width: 175, depth: 150 })).toEqual(['BOTTOM_TRAPEZOID_DEGENERATE']);
    expect(getDimensionWarnings({ width: Number.NaN, depth: 150 })).toEqual([]);
  });
});
