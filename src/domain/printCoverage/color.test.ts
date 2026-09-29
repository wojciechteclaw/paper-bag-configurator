import { describe, expect, it } from 'vitest';
import { deltaE76, hexToRgb, normalizeHex, rgbToLab } from './color';

describe('normalizeHex / hexToRgb', () => {
  it('normalises short and long forms to lower-case #rrggbb', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' c8102E ')).toBe('#c8102e');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
  });

  it('parses channels', () => {
    expect(hexToRgb('#c8102e')).toEqual({ r: 200, g: 16, b: 46 });
    expect(hexToRgb('nope')).toBeNull();
  });
});

describe('rgbToLab / deltaE76', () => {
  it('maps white and black to the ends of L*', () => {
    const white = rgbToLab(255, 255, 255);
    expect(white.l).toBeCloseTo(100, 2);
    expect(white.a).toBeCloseTo(0, 2);
    expect(white.b).toBeCloseTo(0, 2);
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 6);
  });

  it('matches reference Lab values of sRGB red', () => {
    const red = rgbToLab(255, 0, 0);
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });

  it('measures perceptual distance', () => {
    const a = rgbToLab(200, 16, 46);
    expect(deltaE76(a, a)).toBe(0);
    expect(deltaE76(rgbToLab(250, 250, 250), rgbToLab(255, 255, 255))).toBeLessThan(3);
    expect(deltaE76(rgbToLab(255, 0, 0), rgbToLab(0, 0, 255))).toBeGreaterThan(100);
  });
});
