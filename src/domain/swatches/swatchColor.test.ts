import { describe, expect, it } from 'vitest';
import { deltaE2000, rgbToLab } from '../printCoverage/color';
import { grayToRgb, labD50ToD65, naiveCmykToRgb, swatchColorFromLabD50, unitRgbToRgb } from './swatchColor';

describe('swatch colour conversion', () => {
  it('adapts Lab D50 → D65 keeping neutrals neutral', () => {
    const white = labD50ToD65({ l: 100, a: 0, b: 0 });
    expect(white.l).toBeCloseTo(100, 2);
    expect(Math.abs(white.a)).toBeLessThan(0.05);
    expect(Math.abs(white.b)).toBeLessThan(0.05);
    const grey = labD50ToD65({ l: 50, a: 0, b: 0 });
    expect(Math.hypot(grey.a, grey.b)).toBeLessThan(0.05);
  });

  it('maps the D50 Lab of sRGB red (ICC) close to the D65 Lab of #ff0000', () => {
    // sRGB red in Lab D50 (Bradford-adapted, as Photoshop reports it): ≈ 54.29, 80.80, 69.89.
    const adapted = labD50ToD65({ l: 54.29, a: 80.8, b: 69.89 });
    expect(deltaE2000(adapted, rgbToLab(255, 0, 0))).toBeLessThan(1);
    expect(swatchColorFromLabD50({ l: 54.29, a: 80.8, b: 69.89 }).hex).toMatch(/^#f[a-f0-9]0[0-9a-f]0[0-9a-f]$/);
  });

  it('converts RGB / CMYK / Gray unit values to 8-bit sRGB, clamping out-of-range values', () => {
    expect(unitRgbToRgb(1, 0.5, -1)).toEqual({ r: 255, g: 128, b: 0 });
    expect(naiveCmykToRgb(0, 0, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(naiveCmykToRgb(0, 1, 1, 0)).toEqual({ r: 255, g: 0, b: 0 });
    expect(naiveCmykToRgb(0, 0, 0, 1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(grayToRgb(1)).toEqual({ r: 255, g: 255, b: 255 });
    expect(grayToRgb(0)).toEqual({ r: 0, g: 0, b: 0 });
  });
});
