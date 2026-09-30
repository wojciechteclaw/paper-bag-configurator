import { describe, expect, it } from 'vitest';
import { deltaE2000, deltaE76, hexToRgb, labToRgb, normalizeHex, rgbToHex, rgbToLab } from '../../../src/domain/printCoverage/color';

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

describe('labToRgb / rgbToHex', () => {
  it('round-trips sRGB through CIELAB', () => {
    for (const [r, g, b] of [[200, 16, 46], [0, 94, 184], [255, 255, 255], [0, 0, 0], [45, 41, 38], [255, 209, 0]]) {
      expect(labToRgb(rgbToLab(r, g, b))).toEqual({ r, g, b });
    }
  });

  it('clamps out-of-gamut Lab and formats hex', () => {
    const rgb = labToRgb({ l: 50, a: 120, b: -120 });
    for (const c of [rgb.r, rgb.g, rgb.b]) expect(c).toBeGreaterThanOrEqual(0);
    expect(rgbToHex({ r: 200, g: 16, b: 46 })).toBe('#c8102e');
    expect(rgbToHex({ r: 300, g: -4, b: 10.4 })).toBe('#ff000a');
  });
});

describe('deltaE2000', () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), table 1.
  const pairs: [number, number, number, number, number, number, number][] = [
    [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
    [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
    [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0],
    [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
    [50, 0, 0, 50, -1, 2, 2.3669],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
    [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
  ];

  it('matches the reference values and is symmetric', () => {
    for (const [l1, a1, b1, l2, a2, b2, expected] of pairs) {
      const p = { l: l1, a: a1, b: b1 };
      const q = { l: l2, a: a2, b: b2 };
      expect(deltaE2000(p, q)).toBeCloseTo(expected, 4);
      expect(deltaE2000(q, p)).toBeCloseTo(expected, 4);
    }
    const red = rgbToLab(200, 16, 46);
    expect(deltaE2000(red, red)).toBe(0);
  });
});
