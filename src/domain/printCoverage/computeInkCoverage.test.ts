import { describe, expect, it } from 'vitest';
import { buildDieline } from '../dieline';
import type { ArtworkPlacement, Dimensions, PantoneColor, PanelPosition, PaperColor } from '../types';
import { computeInkCoverage, type CoveragePanelInput, type PixelSample } from './computeInkCoverage';

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 16, 46, 255];
const BLUE: Rgba = [0, 94, 184, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

const example: Dimensions = { width: 200, height: 400, depth: 150 };
const dieline = buildDieline({ dimensions: example, handle: null });
const SHEET = dieline.sheet.width * dieline.sheet.height;
const FRONT_AREA = 200 * 400;

/** `rows[0]` is the TOP row of the image. */
const sample = (rows: Rgba[][]): PixelSample => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8ClampedArray.from(rows.flat(2)),
});

const panel = (rows: Rgba[][], placement: ArtworkPlacement = { mode: 'FILL' }): CoveragePanelInput => {
  const s = sample(rows);
  return { imageSize: { width: s.width, height: s.height }, placement, sample: s };
};

const palette: PantoneColor[] = [
  { code: 'PMS 186 C', hex: '#c8102e' },
  { code: 'PMS 300 C', hex: '#005eb8' },
];

const compute = (
  panels: Partial<Record<PanelPosition, CoveragePanelInput>>,
  { paperColor = 'WHITE' as PaperColor, pantoneColors = palette } = {},
) => computeInkCoverage({ dieline, panels, paperColor, pantoneColors });

describe('computeInkCoverage', () => {
  it('reports the sheet area and zero ink without artwork, with wall areas per panel', () => {
    const result = compute({});
    expect(result.sheetArea).toBe(SHEET);
    expect(result.inkArea).toBe(0);
    expect(result.sheetRatio).toBe(0);
    expect(result.colors.map((c) => c.area)).toEqual([0, 0]);
    expect(result.panels.FRONT?.wallArea).toBe(FRONT_AREA);
    expect(result.panels.BACK?.wallArea).toBe(FRONT_AREA);
    expect(result.panels.LEFT?.wallArea).toBe(150 * 400);
    expect(result.hints).toEqual([]);
  });

  it('counts a solid FILL artwork as the whole wall, as a share of the sheet', () => {
    const result = compute({ FRONT: panel([[RED]]) });
    expect(result.inkArea).toBeCloseTo(FRONT_AREA, 6);
    expect(result.sheetRatio).toBeCloseTo(FRONT_AREA / SHEET, 9);
    expect(result.colors[0]).toMatchObject({ code: 'PMS 186 C', hex: '#c8102e' });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA, 6);
    expect(result.colors[1].area).toBe(0);
    expect(result.panels.FRONT?.inkArea).toBeCloseTo(FRONT_AREA, 6);
  });

  it('splits ink between the nearest Pantone colours', () => {
    const result = compute({ FRONT: panel([[RED, BLUE]]) });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA / 2, 6);
    expect(result.colors[1].area).toBeCloseTo(FRONT_AREA / 2, 6);
    expect(result.inkArea).toBeCloseTo(FRONT_AREA, 6);
  });

  it('assigns off-palette colours to the perceptually nearest preview', () => {
    const result = compute({ FRONT: panel([[[220, 40, 60, 255]]]) });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA, 6);
    expect(result.hints).toEqual([]);
  });

  it('hints when a large part of the ink is far from every preview colour', () => {
    const result = compute({ FRONT: panel([[[0, 200, 0, 255]]]) });
    expect(result.inkArea).toBeCloseTo(FRONT_AREA, 6);
    expect(result.poorMatchArea).toBeCloseTo(FRONT_AREA, 6);
    expect(result.hints).toContain('POOR_COLOR_MATCH');
  });

  it('treats transparent pixels as no ink and weights semi-transparent ones by alpha', () => {
    expect(compute({ FRONT: panel([[CLEAR]]) }).inkArea).toBe(0);
    expect(compute({ FRONT: panel([[[200, 16, 46, 5]]]) }).inkArea).toBe(0);
    expect(compute({ FRONT: panel([[[200, 16, 46, 102]]]) }).inkArea).toBeCloseTo(FRONT_AREA * 0.4, 1);
  });

  it('treats near-white as bare paper on WHITE paper but as white ink on BROWN paper', () => {
    const whiteArt = { FRONT: panel([[WHITE, [250, 250, 248, 255]]]) };
    expect(compute(whiteArt, { paperColor: 'WHITE' }).inkArea).toBe(0);
    const brown = compute(whiteArt, { paperColor: 'BROWN', pantoneColors: [{ code: 'White', hex: '#ffffff' }] });
    expect(brown.inkArea).toBeCloseTo(FRONT_AREA, 6);
    expect(brown.colors[0].area).toBeCloseTo(FRONT_AREA, 6);
    // A light grey is ink even on white paper.
    expect(compute({ FRONT: panel([[[224, 224, 224, 255]]]) }).inkArea).toBeCloseTo(FRONT_AREA, 6);
  });

  it('reports the total only (unassigned) with a hint when the Pantone list is empty', () => {
    const result = compute({ FRONT: panel([[RED]]) }, { pantoneColors: [] });
    expect(result.colors).toEqual([]);
    expect(result.unassignedArea).toBeCloseTo(FRONT_AREA, 6);
    expect(result.unassignedSheetRatio).toBeCloseTo(result.sheetRatio, 12);
    expect(result.hints).toEqual(['NO_PANTONE_COLORS']);
  });

  it('follows the placement: contain keeps the aspect ratio, the part outside the wall is clipped', () => {
    // Square image contained on a 200 × 400 wall → 200 × 200 mm.
    const contain: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
    expect(compute({ FRONT: panel([[RED]], contain) }).inkArea).toBeCloseTo(200 * 200, 6);
    // Centre moved to y = 300 → image spans y 200..400: fully inside. Centre at y = 400 → half above the wall.
    const high: ArtworkPlacement = { ...contain, offsetY: 200 };
    expect(compute({ FRONT: panel([[RED]], high) }).inkArea).toBeCloseTo(200 * 100, 6);
  });

  it('keeps the image orientation of the previews (row 0 = image top)', () => {
    // 1 × 2 px image contained → 200 × 400 mm; centred on the top edge only its bottom half (BLUE) is on the wall.
    const high: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 200, scale: 1, rotation: 0 };
    const result = compute({ FRONT: panel([[RED], [BLUE]], high) });
    expect(result.colors[0].area).toBe(0);
    expect(result.colors[1].area).toBeCloseTo(FRONT_AREA / 2, 6);
  });

  it('applies the rotation (90° counter-clockwise: the image left edge ends at the bottom)', () => {
    const rotated: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 200, scale: 1, rotation: 90 };
    const result = compute({ FRONT: panel([[RED, BLUE]], rotated) });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA / 2, 6);
    expect(result.colors[1].area).toBe(0);
  });

  it('maps BACK through its sheet column(s) in panel-local coordinates', () => {
    // FILL: left image half → back x 0..100, right half → x 100..200 (whatever the column layout).
    const result = compute({ BACK: panel([[RED, BLUE]]) });
    expect(result.colors[0].area).toBeCloseTo(FRONT_AREA / 2, 6);
    expect(result.colors[1].area).toBeCloseTo(FRONT_AREA / 2, 6);
    expect(result.panels.BACK?.wallArea).toBe(FRONT_AREA);
    expect(result.panels.BACK?.colorAreas[0]).toBeCloseTo(FRONT_AREA / 2, 6);
  });

  it('sums all panels; per-colour areas add up to the total', () => {
    const result = compute({
      FRONT: panel([[RED]]),
      BACK: panel([[BLUE]]),
      LEFT: panel([[RED, CLEAR]]),
      RIGHT: panel([[WHITE]]),
    });
    const expected = FRONT_AREA * 2 + (150 * 400) / 2;
    expect(result.inkArea).toBeCloseTo(expected, 6);
    expect(result.colors[0].area + result.colors[1].area).toBeCloseTo(result.inkArea, 6);
    expect(result.sheetRatio).toBeLessThan(1);
  });

  it('ignores malformed samples', () => {
    const broken: CoveragePanelInput = {
      imageSize: { width: 10, height: 10 },
      placement: { mode: 'FILL' },
      sample: { width: 10, height: 10, data: new Uint8ClampedArray(4) },
    };
    expect(compute({ FRONT: broken }).inkArea).toBe(0);
  });
});
