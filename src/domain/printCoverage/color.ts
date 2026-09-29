// Colour math for the ink-coverage estimate (docs/SPEC.md §4d). Pure TS.

export type Rgb = { r: number; g: number; b: number };
export type Lab = { l: number; a: number; b: number };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `abc` / `#AABBCC` → `#aabbcc`; null when not a valid hex colour. */
export function normalizeHex(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sRGB 8-bit channel → linear light, as a lookup table (used per pixel).
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

// D65 reference white.
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** 8-bit sRGB → CIE L*a*b* (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = LINEAR[r & 255];
  const gl = LINEAR[g & 255];
  const bl = LINEAR[b & 255];
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / YN;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 colour difference ΔE*ab. */
export function deltaE76(p: Lab, q: Lab): number {
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

const DEG = Math.PI / 180;
const POW25_7 = 25 ** 7;

/**
 * CIEDE2000 colour difference ΔE00 (kL = kC = kH = 1), per Sharma, Wu & Dalal (2005). Perceptually more uniform than
 * CIE76 (smaller for saturated colours, larger for near-neutrals), so one tolerance behaves alike across the gamut.
 */
export function deltaE2000(p: Lab, q: Lab): number {
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cMean7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMean7 / (cMean7 + POW25_7)));
  const a1 = p.a * (1 + g);
  const a2 = q.a * (1 + g);
  const cp1 = Math.hypot(a1, p.b);
  const cp2 = Math.hypot(a2, q.b);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / DEG;
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);

  const dL = q.l - p.l;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * DEG);

  const lMean = (p.l + q.l) / 2;
  const cpMean = (cp1 + cp2) / 2;
  let hMean = h1 + h2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hMean /= 2;
    else hMean = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hMean - 30) * DEG) +
    0.24 * Math.cos(2 * hMean * DEG) +
    0.32 * Math.cos((3 * hMean + 6) * DEG) -
    0.2 * Math.cos((4 * hMean - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const cpMean7 = cpMean ** 7;
  const rc = 2 * Math.sqrt(cpMean7 / (cpMean7 + POW25_7));
  const l50 = (lMean - 50) ** 2;
  const sl = 1 + (0.015 * l50) / Math.sqrt(20 + l50);
  const sc = 1 + 0.045 * cpMean;
  const sh = 1 + 0.015 * cpMean * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;
  const vl = dL / sl;
  const vc = dC / sc;
  const vh = dH / sh;
  return Math.sqrt(vl * vl + vc * vc + vh * vh + rt * vc * vh);
}

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

/** 8-bit sRGB → `#rrggbb` (channels rounded and clamped). */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')}`;
}

const fInverse = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);
const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** CIE L*a*b* (D65) → 8-bit sRGB (clamped to the gamut). Inverse of `rgbToLab`. */
export function labToRgb({ l, a, b }: Lab): Rgb {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = fInverse(fx) * XN;
  const y = (l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA) * YN;
  const z = fInverse(fz) * ZN;
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return { r: clampByte(toSrgb(rl)), g: clampByte(toSrgb(gl)), b: clampByte(toSrgb(bl)) };
}
