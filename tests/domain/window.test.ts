import { describe, expect, it } from 'vitest';
import { BAG_TYPES, WINDOW_RULES } from '../../src/domain/config/productCatalog';
import { createConfiguration } from '../../src/domain/factories';
import type { BagWindow } from '../../src/domain/types';
import {
  constrainWindow,
  createWindow,
  getWindow,
  getWindowFilm,
  getWindowFilmArea,
  getWindowLimits,
  getWindowOpening,
  getWindowWarnings,
  isInWindowOpening,
  validateWindow,
  validateWindowValue,
  windowsEqual,
} from '../../src/domain/window';

// Client example 140 + 90 × 370, bottom strip d = 25; default overlap 10 + safety 5 → margin m = 15 mm.
const dims = { width: 140, height: 370, depth: 90 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'PP', width: 40, filmOverlap: 10 };
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'CELLULOSE', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };

describe('window catalog', () => {
  it('offers the client decisions [K]: two types, three films, overlap 5–20 (10), gusseted bag only', () => {
    expect(WINDOW_RULES.types).toEqual(['PANORAMIC', 'RECTANGLE']);
    expect(WINDOW_RULES.materials).toEqual(['PP', 'PP_PERFORATED', 'CELLULOSE']);
    expect(WINDOW_RULES.filmOverlap).toMatchObject({ min: 5, max: 20, default: 10 });
    expect(BAG_TYPES.FOLDED.windowAvailable).toBe(true);
    expect(BAG_TYPES.BLOCK.windowAvailable).toBe(false);
  });

  it('starts without a window; older data without the field reads as none', () => {
    expect(createConfiguration('FOLDED').window).toBeNull();
    expect(getWindow({})).toBeNull();
  });
});

describe('window geometry (FRONT panel-local mm)', () => {
  it('centres the panoramic strip and runs it from above the bottom strip (d + m) up to the mouth', () => {
    expect(getWindowOpening(panoramic, dims)).toEqual({ x: 50, y: 40, width: 40, height: 330, openAtTop: true });
    // Film: overlap on the three closed sides, ends at the mouth.
    expect(getWindowFilm(panoramic, dims)).toEqual({ x: 40, y: 30, width: 60, height: 340 });
    expect(getWindowFilmArea(panoramic, dims)).toBe(60 * 340);
  });

  it('places the rectangle centred, its lower edge bottomOffset above the bottom fold line, film on all four sides', () => {
    expect(getWindowOpening(rectangle, dims)).toEqual({ x: 40, y: 150, width: 60, height: 100, openAtTop: false });
    expect(getWindowFilm(rectangle, dims)).toEqual({ x: 30, y: 140, width: 80, height: 120 });
  });

  it('keeps overlap + safety margin of paper to the side creases, the bottom strip and the mouth', () => {
    expect(getWindowLimits(panoramic, dims)).toEqual({
      width: { min: 20, max: 110 },
      height: { min: 330, max: 330 },
      // The strip may start anywhere from d + m = 40 up to the minimum opening below the mouth (370 − 20).
      bottomOffset: { min: 40, max: 350 },
      filmOverlap: { min: 5, max: 20 },
    });
    // Rectangle: height ≤ H − d − 2m = 315; bottom offset d + m … H − m − height.
    expect(getWindowLimits(rectangle, dims)).toMatchObject({
      height: { min: 20, max: 315 },
      bottomOffset: { min: 40, max: 255 },
    });
    // A larger overlap needs more paper around the opening.
    expect(getWindowLimits({ ...rectangle, filmOverlap: 20 }, dims).width).toEqual({ min: 20, max: 90 });
  });

  it('tests points against the opening (half-open edges)', () => {
    const opening = getWindowOpening(rectangle, dims);
    expect(isInWindowOpening(opening, 40, 150)).toBe(true);
    expect(isInWindowOpening(opening, 99.9, 249.9)).toBe(true);
    expect(isInWindowOpening(opening, 100, 200)).toBe(false);
    expect(isInWindowOpening(opening, 39.9, 200)).toBe(false);
  });
});

describe('createWindow / constrainWindow', () => {
  it('creates valid defaults [Z] for both types', () => {
    const p = createWindow('PANORAMIC', dims);
    expect(p).toEqual({ type: 'PANORAMIC', material: 'PP', width: 40, bottomOffset: 40, filmOverlap: 10 });
    const r = createWindow('RECTANGLE', dims);
    expect(r).toEqual({ type: 'RECTANGLE', material: 'PP', width: 55, height: 110, bottomOffset: 145, filmOverlap: 10 });
    expect(validateWindow(p, dims)).toEqual([]);
    expect(validateWindow(r, dims)).toEqual([]);
  });

  it('keeps material, overlap and width when switching the type', () => {
    const switched = createWindow('RECTANGLE', dims, { ...panoramic, material: 'PP_PERFORATED', filmOverlap: 12, width: 70 });
    expect(switched).toMatchObject({ type: 'RECTANGLE', material: 'PP_PERFORATED', filmOverlap: 12, width: 70 });
  });

  it('clamps every value into its limits, overlap first, in whole millimetres', () => {
    expect(constrainWindow({ ...rectangle, width: 500, height: 5, bottomOffset: 1000, filmOverlap: 30 }, dims)).toEqual({
      type: 'RECTANGLE',
      material: 'CELLULOSE',
      width: 90, // 140 − 2 · (20 + 5)
      height: 20,
      bottomOffset: 325, // 370 − 25 − 20
      filmOverlap: 20,
    });
    expect(constrainWindow({ ...panoramic, width: 33.6 }, dims).width).toBe(34);
    expect(constrainWindow({ ...panoramic, width: Number.NaN, filmOverlap: Number.NaN }, dims)).toMatchObject({ width: 40, filmOverlap: 10 });
    expect(constrainWindow({ ...panoramic, material: 'GLASS' as never }, dims).material).toBe('PP');
  });

  it('follows smaller dimensions (the window always fits the bag)', () => {
    const small = { width: 100, height: 170, depth: 50 };
    const fitted = constrainWindow({ ...rectangle, width: 110, height: 200 }, small);
    expect(fitted).toMatchObject({ width: 70, height: 115, bottomOffset: 40 }); // 170 − 25 − 2 · 15 = 115
    expect(validateWindow(fitted, small)).toEqual([]);
  });
});

describe('validation', () => {
  it('reports typed errors for drafts', () => {
    expect(validateWindowValue('width', Number.NaN, rectangle, dims)).toBe('NOT_A_NUMBER');
    expect(validateWindowValue('width', 50.5, rectangle, dims)).toBe('NOT_INTEGER');
    expect(validateWindowValue('width', 10, rectangle, dims)).toBe('BELOW_MIN');
    expect(validateWindowValue('width', 111, rectangle, dims)).toBe('ABOVE_MAX');
    expect(validateWindowValue('filmOverlap', 21, rectangle, dims)).toBe('ABOVE_MAX');
    expect(validateWindowValue('bottomOffset', 39, rectangle, dims)).toBe('BELOW_MIN');
    expect(validateWindowValue('bottomOffset', 255, rectangle, dims)).toBeNull();
  });

  it('lists the out-of-range fields of a stored window with their limits', () => {
    expect(validateWindow({ ...rectangle, width: 200, bottomOffset: 10 }, dims)).toEqual([
      { field: 'width', code: 'ABOVE_MAX', min: 20, max: 110 },
      { field: 'bottomOffset', code: 'BELOW_MIN', min: 40, max: 255 },
    ]);
  });

  it('warns when the opening takes more than half of the FRONT print area', () => {
    expect(getWindowWarnings(rectangle, dims)).toEqual([]);
    expect(getWindowWarnings({ ...panoramic, width: 100 }, dims)).toEqual(['WINDOW_LARGE_OPENING']);
  });

  it('compares windows by value', () => {
    expect(windowsEqual(rectangle, { ...rectangle })).toBe(true);
    expect(windowsEqual(rectangle, { ...rectangle, bottomOffset: 151 })).toBe(false);
    expect(windowsEqual(null, null)).toBe(true);
    expect(windowsEqual(panoramic, null)).toBe(false);
  });
});

describe('panoramic strip start (client [K], 30.09.2026)', () => {
  it('starts where bottomOffset says, runs to the mouth, and clamps the start into its range', () => {
    const strip: BagWindow = { type: 'PANORAMIC', material: 'PP', width: 40, bottomOffset: 120, filmOverlap: 10 };
    expect(getWindowOpening(strip, dims)).toEqual({ x: 50, y: 120, width: 40, height: 250, openAtTop: true });
    expect(getWindowLimits(strip, dims).height).toEqual({ min: 250, max: 250 });
    expect(constrainWindow({ ...strip, bottomOffset: 10 }, dims)).toMatchObject({ bottomOffset: 40 });
    expect(constrainWindow({ ...strip, bottomOffset: 369 }, dims)).toMatchObject({ bottomOffset: 350 });
    // Older data without the start: the lowest position.
    const { bottomOffset: _omit, ...legacy } = strip;
    expect(getWindowOpening(legacy as BagWindow, dims).y).toBe(40);
    expect(constrainWindow(legacy as BagWindow, dims)).toMatchObject({ bottomOffset: 40 });
  });
});
