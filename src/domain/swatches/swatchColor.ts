// Conversions of ASE colour values to CIELAB (D65) and a preview hex. Pure TS.

import { labToRgb, rgbToHex, rgbToLab, type Lab, type Rgb } from '../printCoverage/color';

// Reference whites (CIE 1931 2°).
const D50 = { x: 0.96422, y: 1, z: 0.82521 };
const D65 = { x: 0.95047, y: 1, z: 1.08883 };
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const fInverse = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

// Bradford chromatic adaptation D50 → D65.
const BRADFORD_D50_TO_D65 = [
  [0.9555766, -0.0230393, 0.0631636],
  [-0.0282895, 1.0099416, 0.0210077],
  [0.0122982, -0.020483, 1.3299098],
] as const;

/**
 * CIELAB relative to D50 (the white point of Lab in Adobe applications and Pantone libraries) → CIELAB relative to
 * D65 (the space of `rgbToLab`, used for all matching in the app), via XYZ and the Bradford transform.
 */
export function labD50ToD65({ l, a, b }: Lab): Lab {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = fInverse(fx) * D50.x;
  const y = (l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA) * D50.y;
  const z = fInverse(fz) * D50.z;
  const [m0, m1, m2] = BRADFORD_D50_TO_D65;
  const x65 = m0[0] * x + m0[1] * y + m0[2] * z;
  const y65 = m1[0] * x + m1[1] * y + m1[2] * z;
  const z65 = m2[0] * x + m2[1] * y + m2[2] * z;
  const gx = f(x65 / D65.x);
  const gy = f(y65 / D65.y);
  const gz = f(z65 / D65.z);
  return { l: 116 * gy - 16, a: 500 * (gx - gy), b: 200 * (gy - gz) };
}

const unit = (v: number) => Math.min(1, Math.max(0, v));
const toByte = (v: number) => Math.round(unit(v) * 255);

/** RGB channels 0..1 (as stored in ASE) → 8-bit sRGB. */
export function unitRgbToRgb(r: number, g: number, b: number): Rgb {
  return { r: toByte(r), g: toByte(g), b: toByte(b) };
}

/**
 * CMYK 0..1 → sRGB by the naive formula `255 · (1 − C) · (1 − K)` etc. No ICC profile, so only a rough on-screen
 * approximation (swatches converted this way are flagged `approximate`).
 */
export function naiveCmykToRgb(c: number, m: number, y: number, k: number): Rgb {
  const white = 1 - unit(k);
  return { r: toByte((1 - unit(c)) * white), g: toByte((1 - unit(m)) * white), b: toByte((1 - unit(y)) * white) };
}

/** ASE Gray value 0..1 (0 = black, 1 = white) → sRGB. */
export function grayToRgb(value: number): Rgb {
  const v = toByte(value);
  return { r: v, g: v, b: v };
}

export type SwatchColor = { lab: Lab; hex: string };

export function swatchColorFromRgb(rgb: Rgb): SwatchColor {
  return { lab: rgbToLab(rgb.r, rgb.g, rgb.b), hex: rgbToHex(rgb) };
}

export function swatchColorFromLabD50(labD50: Lab): SwatchColor {
  const lab = labD50ToD65(labD50);
  return { lab, hex: rgbToHex(labToRgb(lab)) };
}
