import { describe, expect, it } from 'vitest';
import { buildDieline } from '../../../src/domain/dieline';
import type { ArtworkPlacement, Dimensions, PantoneColor, PanelPosition, PaperColor } from '../../../src/domain/types';
import { computeArtworkPalette } from '../../../src/domain/printCoverage/artworkPalette';
import { deltaE2000, hexToRgb, rgbToLab } from '../../../src/domain/printCoverage/color';
import type { ColorAnalysisSettings } from '../../../src/domain/types';
import { COLOR_ANALYSIS_DEFAULTS } from '../../../src/domain/config/productCatalog';
import { computeInkCoverage } from '../../../src/domain/printCoverage/computeInkCoverage';
import type { CoveragePanelInput, PixelSample } from '../../../src/domain/printCoverage/sampling';

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 16, 46, 255];
const BLUE: Rgba = [0, 94, 184, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

const example: Dimensions = { width: 200, height: 400, depth: 150 };
const dieline = buildDieline({ dimensions: example, handle: null });
const SHEET = dieline.sheet.width * dieline.sheet.height;
const FRONT_AREA = 200 * 400;
const ALLOWANCE = 90; // (150 + 30) / 2

const sample = (rows: Rgba[][]): PixelSample => ({ width: rows[0].length, height: rows.length, data: Uint8ClampedArray.from(rows.flat(2)) });
const panel = (rows: Rgba[][], placement: ArtworkPlacement = { mode: 'FILL', extendToBottom: false }): CoveragePanelInput => {
  const s = sample(rows);
  return { imageSize: { width: s.width, height: s.height }, placement, sample: s };
};

const pantones: PantoneColor[] = [
  { code: 'PMS 186 C', hex: '#c8102e' },
  { code: 'PMS 300 C', hex: '#005eb8' },
];

const palette = (
  panels: Partial<Record<PanelPosition, CoveragePanelInput>>,
  {
    paperColor = 'WHITE' as PaperColor,
    pantoneColors = pantones as readonly PantoneColor[],
    colorAnalysis = undefined as Partial<ColorAnalysisSettings> | undefined,
  } = {},
) => computeArtworkPalette({ dieline, panels, paperColor, pantoneColors, colorAnalysis });

/** Linear blend in (gamma-encoded) sRGB — how browsers / design tools anti-alias an edge. */
const blend = (a: Rgba, b: Rgba, t: number): Rgba => [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)).concat(255) as Rgba;

/** Deterministic noise in [−amplitude, amplitude] per channel (LCG), like JPEG compression artefacts on a flat area. */
function noisy(color: Rgba, amplitude: number, seed: number): () => Rgba {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state % (2 * amplitude + 1)) - amplitude;
  };
  return () => [0, 1, 2].map((c) => Math.min(255, Math.max(0, color[c] + next()))).concat(255) as Rgba;
}

const grid = (width: number, height: number, pixel: (x: number, y: number) => Rgba): Rgba[][] =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => pixel(x, y)));

const channelDistance = (hex: string, [r, g, b]: Rgba) => {
  const rgb = hexToRgb(hex)!;
  return Math.max(Math.abs(rgb.r - r), Math.abs(rgb.g - g), Math.abs(rgb.b - b));
};

describe('computeArtworkPalette', () => {
  it('is empty without artwork', () => {
    const result = palette({});
    expect(result.colors).toEqual([]);
    expect(result.inkArea).toBe(0);
    expect(result.other).toEqual({ area: 0, sheetRatio: 0, colorCount: 0 });
    expect(result.sheetArea).toBe(SHEET);
  });

  it('finds the exact colour of a flat artwork with its area and nearest Pantone', () => {
    const result = palette({ FRONT: panel([[RED]]) });
    expect(result.colors).toHaveLength(1);
    const [red] = result.colors;
    expect(red.hex).toBe('#c8102e');
    expect(red.area).toBeCloseTo(FRONT_AREA, 6);
    expect(red.sheetRatio).toBeCloseTo(FRONT_AREA / SHEET, 9);
    expect(red.inkShare).toBeCloseTo(1, 9);
    expect(red.pantone?.code).toBe('PMS 186 C');
    expect(red.pantone?.deltaE).toBeLessThan(0.5);
  });

  it('measures known colour areas across panels and sorts by area', () => {
    const result = palette({
      FRONT: panel([[RED, RED, RED, BLUE]]),
      LEFT: panel([[BLUE, CLEAR]]),
    });
    expect(result.colors.map((c) => c.hex)).toEqual(['#c8102e', '#005eb8']);
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA * 0.75, 6);
    expect(result.colors[1].area).toBeCloseTo(FRONT_AREA * 0.25 + (150 * 400) / 2, 6);
    expect(result.colors[1].pantone?.code).toBe('PMS 300 C');
    expect(result.inkArea).toBeCloseTo(result.colors[0].area + result.colors[1].area, 6);
    expect(result.other.area).toBeCloseTo(0, 6);
  });

  it('detects colours independently of the Pantone list (nearest Pantone with ΔE, none for an empty list)', () => {
    const green: Rgba = [0, 170, 0, 255];
    const withList = palette({ FRONT: panel([[green]]) });
    expect(withList.colors[0].hex).toBe('#00aa00');
    expect(withList.colors[0].pantone?.deltaE).toBeGreaterThan(30);
    const noList = palette({ FRONT: panel([[green]]) }, { pantoneColors: [] });
    expect(noList.colors[0].hex).toBe('#00aa00');
    expect(noList.colors[0].pantone).toBeNull();
  });

  it('merges near-identical shades (ΔE below the threshold) into one colour', () => {
    const result = palette({ FRONT: panel([[RED, [204, 20, 50, 255]]]) });
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA, 6);
    // …but keeps clearly different ones apart.
    expect(palette({ FRONT: panel([[RED, [230, 90, 110, 255]]]) }).colors).toHaveLength(2);
  });

  it('applies the paper rules: near-white is bare paper on WHITE, white ink on BROWN', () => {
    const art = { FRONT: panel([[WHITE, [250, 250, 248, 255], RED, RED]]) };
    const white = palette(art, { paperColor: 'WHITE' });
    expect(white.colors.map((c) => c.hex)).toEqual(['#c8102e']);
    expect(white.inkArea).toBeCloseTo(FRONT_AREA / 2, 6);
    const brown = palette(art, { paperColor: 'BROWN' });
    expect(brown.colors).toHaveLength(2);
    expect(brown.colors.map((c) => c.area)).toEqual([expect.closeTo(FRONT_AREA / 2, 6), expect.closeTo(FRONT_AREA / 2, 6)]);
    const whiteInk = hexToRgb(brown.colors.find((c) => c.hex !== '#c8102e')!.hex)!;
    expect(Math.min(whiteInk.r, whiteInk.g, whiteInk.b)).toBeGreaterThanOrEqual(248);
  });

  it('weights semi-transparent pixels by alpha', () => {
    const result = palette({ FRONT: panel([[[200, 16, 46, 102]]]) });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA * 0.4, 1);
  });

  it('counts the bottom allowance of panels extended to the bottom', () => {
    const result = palette({ FRONT: panel([[RED]], { mode: 'FILL', extendToBottom: true }) });
    expect(result.colors[0].area).toBeCloseTo(200 * (400 + ALLOWANCE), 6);
    // Not extended: the image is clipped to the wall.
    expect(palette({ FRONT: panel([[RED]]) }).colors[0].area).toBeCloseTo(FRONT_AREA, 6);
  });

  it('caps the list and reports the rest as "other"; the total equals the coverage total', () => {
    const levels = [0, 128, 255];
    const row: Rgba[] = levels.flatMap((r) => levels.flatMap((g) => levels.map((b): Rgba => [r, g, b, 255])));
    const panels = { FRONT: panel([row]) };
    const result = palette(panels, { paperColor: 'BROWN', colorAnalysis: { mergeTolerance: 0 } });
    expect(result.colors).toHaveLength(16);
    expect(result.other.colorCount).toBe(27 - 16);
    expect(result.other.area).toBeGreaterThan(0);
    const listed = result.colors.reduce((sum, c) => sum + c.area, 0);
    expect(listed + result.other.area).toBeCloseTo(result.inkArea, 6);
    for (let i = 1; i < result.colors.length; i++) expect(result.colors[i].area).toBeLessThanOrEqual(result.colors[i - 1].area);
    const coverage = computeInkCoverage({ dieline, panels, paperColor: 'BROWN', pantoneColors: pantones });
    expect(result.inkArea).toBeCloseTo(coverage.inkArea, 6);
  });

  it('sends tiny colours (anti-aliasing) to "other"', () => {
    const row: Rgba[] = [...Array<Rgba>(999).fill(RED), BLUE];
    const result = computeArtworkPalette({
      dieline,
      panels: { FRONT: panel([row]) },
      paperColor: 'WHITE',
      rules: { gridCellsLongSide: 2048 },
    });
    expect(result.colors.map((c) => c.hex)).toEqual(['#c8102e']);
    expect(result.other.colorCount).toBe(1);
    expect(result.other.area / result.inkArea).toBeLessThan(0.003);
  });

  it('matches computeInkCoverage for a rotated / placed artwork', () => {
    const placement: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 20, offsetY: 150, scale: 0.8, rotation: 90, extendToBottom: true };
    const panels = { BACK: panel([[RED, BLUE], [CLEAR, [200, 16, 46, 128]]], placement) };
    const result = palette(panels);
    const coverage = computeInkCoverage({ dieline, panels, paperColor: 'WHITE', pantoneColors: pantones });
    expect(result.inkArea).toBeCloseTo(coverage.inkArea, 6);
    expect(result.colors[0].area + result.colors[1].area).toBeCloseTo(coverage.inkArea, 6);
  });
});

describe('computeArtworkPalette — merging similar colours (ColorAnalysisSettings)', () => {
  // 128 × 256 px on the 200 × 400 mm FRONT wall: the default 256-cell grid samples every pixel exactly once.
  const W = 128;
  const H = 256;
  const PX = FRONT_AREA / (W * H);

  it('uses the catalog defaults and reports the settings and the raw shade count', () => {
    const result = palette({ FRONT: panel([[RED, [204, 20, 50, 255]]]) });
    expect(result.settings).toEqual(COLOR_ANALYSIS_DEFAULTS);
    expect(result.rawColorCount).toBe(2);
    expect(result.colors[0].shadeCount).toBe(2);
    expect(palette({ FRONT: panel([[RED]]) }, { colorAnalysis: { mergeTolerance: Number.NaN, minAreaShare: 5 } }).settings).toEqual({
      mergeTolerance: COLOR_ANALYSIS_DEFAULTS.mergeTolerance,
      minAreaShare: 0.05,
    });
  });

  it('turns an anti-aliased edge between two flat colours into exactly those 2 colours', () => {
    // Diagonal edge with an 8-px sRGB ramp (each ramp shade ≈ 1.6 % of the ink — above the minimum share).
    const art = grid(W, H, (x, y) => {
      const edge = 56 + ((y >> 4) % 8);
      if (x < edge) return RED;
      if (x >= edge + 8) return BLUE;
      return blend(RED, BLUE, (x - edge + 1) / 9);
    });
    const result = palette({ FRONT: panel(art) }, { paperColor: 'BROWN' });
    expect(result.colors.map((c) => c.hex).sort()).toEqual(['#005eb8', '#c8102e']);
    expect(result.colors).toHaveLength(2);
    expect(result.other.area).toBe(0);
    // Each ramp shade went to the nearer colour: 4 of 8 ramp columns to each side.
    const redArea = result.colors.find((c) => c.hex === '#c8102e')!.area;
    const expectedRed = art.reduce((sum, _row, y) => sum + 56 + ((y >> 4) % 8) + 4, 0) * PX;
    expect(redArea).toBeCloseTo(expectedRed, 3);
    expect(result.rawColorCount).toBe(10);
    // "Exact" (tolerance 0, no minimum share): every ramp shade is its own colour.
    const exact = palette({ FRONT: panel(art) }, { paperColor: 'BROWN', colorAnalysis: { mergeTolerance: 0, minAreaShare: 0 } });
    expect(exact.colors.length).toBeGreaterThanOrEqual(8);
  });

  it('attributes the anti-aliased edge of a colour on WHITE paper to that colour', () => {
    const art = grid(W, H, (x) => (x < 60 ? RED : x < 68 ? blend(RED, WHITE, (x - 59) / 9) : WHITE));
    const result = palette({ FRONT: panel(art) });
    expect(result.colors.map((c) => c.hex)).toEqual(['#c8102e']);
    expect(result.colors[0].area).toBeCloseTo(result.inkArea, 6);
    expect(result.inkArea).toBeGreaterThan(60 * H * PX);
  });

  it('does not split a flat colour with JPEG-like noise (±3 per channel)', () => {
    const red = noisy(RED, 3, 1);
    const blue = noisy(BLUE, 3, 2);
    const art = grid(W, H, (x) => (x < W / 2 ? red() : blue()));
    const result = palette({ FRONT: panel(art) }, { paperColor: 'BROWN' });
    expect(result.rawColorCount).toBeGreaterThan(100);
    expect(result.colors).toHaveLength(2);
    expect(result.other.area).toBe(0);
    for (const color of result.colors) expect(color.area).toBeCloseTo(FRONT_AREA / 2, 3);
    const [first, second] = result.colors.map((c) => c.hex).sort();
    // The HEX is a real sampled pixel close to the flat colour.
    expect(channelDistance(second, RED)).toBeLessThanOrEqual(3);
    expect(channelDistance(first, BLUE)).toBeLessThanOrEqual(3);
  });

  it('absorbs specks under the minimum share into the nearest close colour, far ones into "other"', () => {
    const speck: Rgba = [220, 70, 50, 255];
    const redLab = rgbToLab(RED[0], RED[1], RED[2]);
    const speckDistance = deltaE2000(redLab, rgbToLab(speck[0], speck[1], speck[2]));
    // Precondition: farther than the tolerance (not merged) but within the absorb radius (2 × tolerance).
    expect(speckDistance).toBeGreaterThan(COLOR_ANALYSIS_DEFAULTS.mergeTolerance);
    expect(speckDistance).toBeLessThan(2 * COLOR_ANALYSIS_DEFAULTS.mergeTolerance);
    const art = grid(W, H, (x, y) => (x % 37 === 5 && y % 29 === 3 ? speck : x % 41 === 7 && y % 31 === 11 ? BLUE : RED));
    const count = (color: Rgba) => art.flat().filter((p) => p === color).length;
    const result = palette({ FRONT: panel(art) });
    expect(result.colors.map((c) => c.hex)).toEqual(['#c8102e']);
    expect(result.colors[0].area).toBeCloseTo((count(RED) + count(speck)) * PX, 3);
    expect(result.other).toEqual({ area: expect.closeTo(count(BLUE) * PX, 3), sheetRatio: expect.any(Number), colorCount: 1 });
    // Without a minimum share every speck colour is listed.
    const all = palette({ FRONT: panel(art) }, { colorAnalysis: { minAreaShare: 0 } });
    expect(all.colors).toHaveLength(3);
  });

  it('tolerance 0 keeps shades apart (previous exact behaviour); the tolerance merges them', () => {
    const art = { FRONT: panel([[RED, [204, 20, 50, 255]]]) };
    expect(palette(art, { colorAnalysis: { mergeTolerance: 0, minAreaShare: 0 } }).colors).toHaveLength(2);
    expect(palette(art, { colorAnalysis: { mergeTolerance: 2 } }).colors).toHaveLength(1); // ΔE00 ≈ 1.2
    // Minor colours go to "other" with tolerance 0 (nothing is close enough to absorb them).
    const specks = palette({ FRONT: panel([[...Array<Rgba>(999).fill(RED), [204, 20, 50, 255]]]) }, { colorAnalysis: { mergeTolerance: 0 } });
    expect(specks.colors).toHaveLength(1);
    expect(specks.other.colorCount).toBeLessThanOrEqual(1);
  });

  it('reports a real sampled colour (the most frequent near the mean), not the mean itself', () => {
    const art = grid(W, H, (x) => (x < 77 ? RED : [206, 22, 52, 255]));
    const result = palette({ FRONT: panel(art) }, { paperColor: 'BROWN' });
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0].hex).toBe('#c8102e');
  });

  it('is deterministic', () => {
    const noise = noisy(RED, 6, 7);
    const art = grid(W, H, (x) => (x < 40 ? noise() : x < 48 ? blend(RED, BLUE, 0.5) : BLUE));
    const a = palette({ FRONT: panel(art) }, { paperColor: 'BROWN' });
    const b = palette({ FRONT: panel(art) }, { paperColor: 'BROWN' });
    expect(a).toEqual(b);
  });
});
