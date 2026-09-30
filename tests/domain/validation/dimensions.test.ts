import { describe, expect, it } from 'vitest';
import { BAG_TYPES } from '../../../src/domain/config/productCatalog';
import { createConfiguration } from '../../../src/domain/factories';
import { validateDimension, validateDimensionValue, validateDimensions } from '../../../src/domain/validation/dimensions';

describe('validateDimension', () => {
  it.each([
    [Number.NaN, 'NOT_A_NUMBER'],
    [0, 'NOT_POSITIVE'],
    [-5, 'NOT_POSITIVE'],
    [50, 'BELOW_MIN'],
    [300, 'ABOVE_MAX'],
    [202, 'NOT_ON_STEP'],
    [200.5, 'NOT_ON_STEP'],
    [205, null],
    [200, null],
  ])('%s → %s', (value, expected) => {
    expect(validateDimension(value, 75, 260)).toBe(expected);
  });
});

describe('validateDimensions', () => {
  const limits = BAG_TYPES.BLOCK.limits;

  it('rejects depth greater than width', () => {
    expect(validateDimensions({ width: 150, height: 300, depth: 160 }, limits)).toEqual({
      depth: 'DEPTH_EXCEEDS_WIDTH',
    });
  });

  it('accepts depth equal to width', () => {
    expect(validateDimensions({ width: 150, height: 300, depth: 150 }, limits)).toEqual({});
  });

  it('reports range errors before the cross-field rule', () => {
    expect(validateDimensions({ width: 50, height: 300, depth: 60 }, limits)).toEqual({ width: 'BELOW_MIN' });
  });
});

describe('validateDimensionValue', () => {
  const limits = BAG_TYPES.BLOCK.limits;
  const dims = { width: 200, height: 400, depth: 150 };

  it.each([
    ['width', 150, null],
    ['width', 145, 'DEPTH_EXCEEDS_WIDTH'],
    ['width', 1, 'BELOW_MIN'],
    ['width', 15, 'BELOW_MIN'],
    ['width', 1500, 'ABOVE_MAX'],
    ['width', 152, 'NOT_ON_STEP'],
    ['width', 147, 'DEPTH_EXCEEDS_WIDTH'],
    ['depth', 200, null],
    ['depth', 205, 'DEPTH_EXCEEDS_WIDTH'],
    ['depth', 35, 'BELOW_MIN'],
    ['height', 402, 'NOT_ON_STEP'],
    ['height', Number.NaN, 'NOT_A_NUMBER'],
  ] as const)('%s = %s → %s', (key, value, expected) => {
    expect(validateDimensionValue(key, value, dims, limits)).toBe(expected);
  });
});

describe('default BLOCK configuration', () => {
  it('has valid default dimensions', () => {
    const config = createConfiguration('BLOCK');
    expect(validateDimensions(config.dimensions, BAG_TYPES.BLOCK.limits)).toEqual({});
  });

  it('has no handle and four empty panels', () => {
    const config = createConfiguration('BLOCK');
    expect(config.handle).toBeNull();
    expect(Object.keys(config.panels)).toEqual(['FRONT', 'BACK', 'LEFT', 'RIGHT']);
    expect(Object.values(config.panels).every((p) => p.artwork === null)).toBe(true);
  });
});
