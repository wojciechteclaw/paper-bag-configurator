import { describe, expect, it } from 'vitest';
import { BAG_TYPES } from './config/productCatalog';
import { clampToStep, constrainDimension, constrainDimensions, constrainGrammage, getEffectiveLimits } from './constraints';

const limits = BAG_TYPES.BLOCK.limits;

describe('clampToStep', () => {
  it.each([
    [202, 200],
    [203, 205],
    [202.5, 205],
    [10, 75],
    [999, 260],
  ])('%s → %s', (value, expected) => {
    expect(clampToStep(value, { min: 75, max: 260 }, 5)).toBe(expected);
  });

  it('pulls off-grid bounds inwards', () => {
    expect(clampToStep(0, { min: 73, max: 262 }, 5)).toBe(75);
    expect(clampToStep(1000, { min: 73, max: 262 }, 5)).toBe(260);
  });
});

describe('getEffectiveLimits', () => {
  it('raises the width minimum to the current depth', () => {
    const effective = getEffectiveLimits({ width: 200, height: 400, depth: 150 }, limits);
    expect(effective.width).toEqual({ min: 150, max: 450 });
  });

  it('keeps the catalog width minimum when depth is smaller', () => {
    expect(getEffectiveLimits({ width: 200, height: 400, depth: 40 }, limits).width.min).toBe(75);
  });

  it('caps the depth maximum at the current width', () => {
    const effective = getEffectiveLimits({ width: 200, height: 400, depth: 150 }, limits);
    expect(effective.depth).toEqual({ min: 40, max: 200 });
  });

  it('leaves height untouched', () => {
    expect(getEffectiveLimits({ width: 200, height: 400, depth: 150 }, limits).height).toEqual(limits.height);
  });

  it('does not mutate the catalog limits', () => {
    getEffectiveLimits({ width: 100, height: 400, depth: 90 }, limits);
    expect(limits.width.min).toBe(75);
    expect(limits.depth.max).toBe(300);
  });
});

describe('constrainDimension', () => {
  const dims = { width: 200, height: 400, depth: 150 };

  it('clamps width up to the depth', () => {
    expect(constrainDimension('width', 100, dims, limits)).toBe(150);
    expect(constrainDimension('width', 1, dims, limits)).toBe(150);
  });

  it('clamps depth down to the width', () => {
    expect(constrainDimension('depth', 250, dims, limits)).toBe(200);
  });

  it('allows width equal to depth', () => {
    expect(constrainDimension('width', 150, dims, limits)).toBe(150);
    expect(constrainDimension('depth', 200, dims, limits)).toBe(200);
  });

  it('clamps into the catalog range', () => {
    expect(constrainDimension('width', 999, dims, limits)).toBe(450);
    expect(constrainDimension('height', 100, dims, limits)).toBe(170);
    expect(constrainDimension('height', 1000, dims, limits)).toBe(470);
    expect(constrainDimension('depth', 10, dims, limits)).toBe(40);
  });

  it('snaps to the 5 mm step', () => {
    expect(constrainDimension('height', 302, dims, limits)).toBe(300);
    expect(constrainDimension('height', 303, dims, limits)).toBe(305);
    expect(constrainDimension('width', 211.4, dims, limits)).toBe(210);
  });

  it('snaps and then respects the cross-field bound', () => {
    // 148 would snap to 150 = depth → allowed; 147 snaps to 145 → clamped back to 150.
    expect(constrainDimension('width', 147, dims, limits)).toBe(150);
    expect(constrainDimension('depth', 203, dims, limits)).toBe(200);
  });

  it('keeps the current value for non-finite input', () => {
    expect(constrainDimension('width', Number.NaN, dims, limits)).toBe(200);
    expect(constrainDimension('depth', Number.POSITIVE_INFINITY, dims, limits)).toBe(150);
  });
});

describe('constrainDimensions', () => {
  const dims = { width: 200, height: 400, depth: 150 };

  it('applies a whole set independent of the current depth lock', () => {
    expect(constrainDimensions({ width: 80, height: 220, depth: 45 }, dims, limits)).toEqual({
      width: 80,
      height: 220,
      depth: 45,
    });
  });

  it('clamps into the catalog ranges and caps depth at the new width', () => {
    expect(constrainDimensions({ width: 999, height: 1000, depth: 998 }, dims, limits)).toEqual({
      width: 450,
      height: 470,
      depth: 300,
    });
    expect(constrainDimensions({ width: 100, height: 302, depth: 150 }, dims, limits)).toEqual({
      width: 100,
      height: 300,
      depth: 100,
    });
  });

  it('keeps current values for non-finite input', () => {
    expect(constrainDimensions({ width: Number.NaN, height: 300, depth: Number.NaN }, dims, limits)).toEqual({
      width: 200,
      height: 300,
      depth: 150,
    });
  });
});

describe('constrainGrammage', () => {
  const grammage = { min: 40, max: 100, step: 10 };
  it.each([
    [70, 70],
    [74, 70],
    [76, 80],
    [10, 40],
    [500, 100],
  ])('%s → %s', (value, expected) => {
    expect(constrainGrammage(value, grammage, 80)).toBe(expected);
  });

  it('keeps the current value for NaN', () => {
    expect(constrainGrammage(Number.NaN, grammage, 60)).toBe(60);
  });
});

