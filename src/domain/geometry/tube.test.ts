import { describe, expect, it } from 'vitest';
import { BOTTOM_ALLOWANCE_EXTRA_MM } from '../config/productionRules';
import { polygonArea } from './sideGusset';
import { getBottomAllowance, getBottomAllowanceStrip, getTubeCutLength, getWallPanelBounds } from './tube';

const dims = { width: 200, height: 400, depth: 150 };

describe('bottom allowance', () => {
  it('uses a 30 mm extra from the catalog', () => {
    expect(BOTTOM_ALLOWANCE_EXTRA_MM).toBe(30);
  });

  it('is (depth + 30) / 2', () => {
    expect(getBottomAllowance(dims)).toBe(90);
    expect(getBottomAllowance({ depth: 40 })).toBe(35);
    expect(getBottomAllowance({ depth: 300 })).toBe(165);
  });

  it('adds to the height for the tube cut length', () => {
    expect(getTubeCutLength(dims)).toBe(490);
    expect(getTubeCutLength({ height: 170, depth: 45 })).toBe(207.5);
  });
});

describe('wall panel bounds', () => {
  it('extend below the bottom fold line on every wall', () => {
    expect(getWallPanelBounds('FRONT', dims)).toEqual({ minX: 0, maxX: 200, minY: -90, maxY: 400 });
    expect(getWallPanelBounds('BACK', dims)).toEqual({ minX: 0, maxX: 200, minY: -90, maxY: 400 });
    expect(getWallPanelBounds('LEFT', dims)).toEqual({ minX: 0, maxX: 150, minY: -90, maxY: 400 });
    expect(getWallPanelBounds('RIGHT', dims)).toEqual({ minX: 0, maxX: 150, minY: -90, maxY: 400 });
  });

  it('describe the allowance strip as a CCW rectangle below y = 0', () => {
    const strip = getBottomAllowanceStrip('LEFT', dims);
    expect(polygonArea(strip)).toBe(150 * 90);
    expect(Math.max(...strip.map((p) => p.y))).toBe(0);
  });
});
