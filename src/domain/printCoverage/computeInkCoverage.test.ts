import { describe, expect, it } from 'vitest';
import { resolvePanelArtworks, WRAP_PANEL_ORDER } from '../artworkLayout';
import { buildDieline } from '../dieline';
import { createArtwork, createConfiguration, createWrapLayer } from '../factories';
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

const panel = (rows: Rgba[][], placement: ArtworkPlacement = { mode: 'FILL', extendToBottom: false }): CoveragePanelInput => {
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
    const contain: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 0, extendToBottom: false };
    expect(compute({ FRONT: panel([[RED]], contain) }).inkArea).toBeCloseTo(200 * 200, 6);
    // Centre moved to y = 300 → image spans y 200..400: fully inside. Centre at y = 400 → half above the wall.
    const high: ArtworkPlacement = { ...contain, offsetY: 200 };
    expect(compute({ FRONT: panel([[RED]], high) }).inkArea).toBeCloseTo(200 * 100, 6);
  });

  it('keeps the image orientation of the previews (row 0 = image top)', () => {
    // 1 × 2 px image contained → 200 × 400 mm; centred on the top edge only its bottom half (BLUE) is on the wall.
    const high: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 200, scale: 1, rotation: 0, extendToBottom: false };
    const result = compute({ FRONT: panel([[RED], [BLUE]], high) });
    expect(result.colors[0].area).toBe(0);
    expect(result.colors[1].area).toBeCloseTo(FRONT_AREA / 2, 6);
  });

  it('applies the rotation (90° counter-clockwise: the image left edge ends at the bottom)', () => {
    const rotated: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 200, scale: 1, rotation: 90, extendToBottom: false };
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
      placement: { mode: 'FILL', extendToBottom: false },
      sample: { width: 10, height: 10, data: new Uint8ClampedArray(4) },
    };
    expect(compute({ FRONT: broken }).inkArea).toBe(0);
  });

  describe('extended to the bottom (SPEC §4f)', () => {
    const a = 90; // (150 + 30) / 2

    it('counts a FILL artwork over the wall and the bottom allowance', () => {
      const result = compute({ FRONT: panel([[RED]], { mode: 'FILL', extendToBottom: true }), LEFT: panel([[BLUE]], { mode: 'FILL', extendToBottom: true }) });
      expect(result.panels.FRONT?.wallArea).toBe(FRONT_AREA);
      expect(result.panels.FRONT?.printArea).toBe(200 * (400 + a));
      expect(result.panels.FRONT?.inkArea).toBeCloseTo(200 * (400 + a), 6);
      expect(result.panels.LEFT?.inkArea).toBeCloseTo(150 * (400 + a), 6);
      expect(result.sheetRatio).toBeCloseTo((350 * (400 + a)) / SHEET, 9);
      // Per Pantone too: the bottom colours are assigned like the wall's.
      expect(result.colors[0].area).toBeCloseTo(200 * (400 + a), 6);
      expect(result.colors[1].area).toBeCloseTo(150 * (400 + a), 6);
    });

    it('counts image parts in the allowance only when extended', () => {
      // Square image, contain (200 × 200 mm on both areas), centre at panel y = 10 → spans y ∈ [−90, 110].
      const wall: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 0, offsetY: 10 - 200, scale: 1, rotation: 0, extendToBottom: false };
      // Not extended: only y ∈ [0, 110] is counted.
      expect(compute({ FRONT: panel([[RED]], wall) }).inkArea).toBeCloseTo(200 * 110, -3); // grid: ±1 cell row
      // Extended area [−90, 400] has its centre at y = 155: the whole image counts.
      const extended: ArtworkPlacement = { ...wall, offsetY: 10 - 155, extendToBottom: true };
      expect(compute({ FRONT: panel([[RED]], extended) }).inkArea).toBeCloseTo(200 * 200, -3);
    });
  });

  describe('whole-bag artwork layers (SPEC §3a, §3b)', () => {
    type LayerSpec = { rows: Rgba[][]; placement?: ArtworkPlacement };
    /**
     * Layers (bottom → top) around the bag FRONT | RIGHT | BACK | LEFT (700 mm, from FRONT's left edge), fed per wall
     * with their resolved areas — exactly what the UI passes.
     */
    const wrapInputs = (layers: LayerSpec[]) => {
      const configuration = createConfiguration('BLOCK');
      configuration.artworkLayout = 'WRAP';
      const samples = layers.map(({ rows }) => sample(rows));
      configuration.wrapLayers = layers.map(({ placement = { mode: 'FILL', extendToBottom: false } }, i) =>
        createWrapLayer(
          createArtwork({
            fileName: `l${i}.png`,
            fileUrl: `blob:l${i}`,
            mimeType: 'image/png',
            width: samples[i].width,
            height: samples[i].height,
            sizeBytes: 1,
          }),
          placement,
        ),
      );
      const resolved = resolvePanelArtworks(configuration);
      return Object.fromEntries(
        WRAP_PANEL_ORDER.map((position) => [
          position,
          resolved[position].layers.map(
            (layer): CoveragePanelInput => ({
              imageSize: { width: samples[layer.stackIndex!].width, height: samples[layer.stackIndex!].height },
              placement: layer.placement,
              area: layer.area,
              clipX: layer.clipX,
              sample: samples[layer.stackIndex!],
            }),
          ),
        ]),
      ) as Record<PanelPosition, CoveragePanelInput[]>;
    };

    it('samples one continuous image around the bag: the first half of the wrap is FRONT + RIGHT', () => {
      // 2 px: red | transparent → ink on wrap x ∈ [0, 350) = FRONT (200) + RIGHT (150); BACK and LEFT stay bare.
      const result = computeInkCoverage({ dieline, panels: wrapInputs([{ rows: [[RED, CLEAR]] }]), paperColor: 'WHITE', pantoneColors: palette });
      expect(result.panels.FRONT?.inkArea).toBeCloseTo(FRONT_AREA, 6);
      expect(result.panels.RIGHT?.inkArea).toBeCloseTo(150 * 400, 6);
      expect(result.panels.BACK?.inkArea).toBe(0);
      expect(result.panels.LEFT?.inkArea).toBe(0);
      expect(result.colors[0].area).toBeCloseTo(350 * 400, 6);
    });

    it('prints on every bottom allowance when a layer extends to the bottom', () => {
      const result = computeInkCoverage({
        dieline,
        panels: wrapInputs([{ rows: [[RED]], placement: { mode: 'FILL', extendToBottom: true } }]),
        paperColor: 'WHITE',
        pantoneColors: palette,
      });
      expect(result.inkArea).toBeCloseTo(700 * 490, 3);
      expect(result.panels.BACK?.printArea).toBeCloseTo(200 * 490, 6);
    });

    it('counts the composite: an opaque upper layer replaces the ink below instead of adding to it', () => {
      // Blue background everywhere, red over the first half of the wrap.
      const result = computeInkCoverage({
        dieline,
        panels: wrapInputs([{ rows: [[BLUE]] }, { rows: [[RED, CLEAR]] }]),
        paperColor: 'WHITE',
        pantoneColors: palette,
      });
      expect(result.inkArea).toBeCloseTo(700 * 400, 3);
      expect(result.colors[0].area).toBeCloseTo(350 * 400, 3); // red
      expect(result.colors[1].area).toBeCloseTo(350 * 400, 3); // blue
      expect(result.panels.FRONT?.colorAreas).toEqual([expect.closeTo(FRONT_AREA, 3), 0]);
    });

    it('blends a semi-transparent upper layer with the one below (alpha "over"), counting the area once', () => {
      const HALF_RED: Rgba = [200, 16, 46, 128];
      const result = computeInkCoverage({
        dieline,
        panels: wrapInputs([{ rows: [[WHITE]] }, { rows: [[HALF_RED]] }]),
        paperColor: 'WHITE',
        pantoneColors: palette,
      });
      // White background alone is bare paper on white; blended with half-red it is a pink ink, over the full wrap.
      expect(result.inkArea).toBeCloseTo(700 * 400, 3);
      expect(result.colors[0].area).toBeCloseTo(700 * 400, 3);
    });

    it('keeps a layer without "extend to bottom" off the allowance while an extended layer below prints there', () => {
      const result = computeInkCoverage({
        dieline,
        panels: wrapInputs([
          { rows: [[BLUE]], placement: { mode: 'FILL', extendToBottom: true } },
          { rows: [[RED]], placement: { mode: 'FILL', extendToBottom: false } },
        ]),
        paperColor: 'WHITE',
        pantoneColors: palette,
      });
      expect(result.colors[0].area).toBeCloseTo(700 * 400, -3); // red on the walls (grid cells straddle the bottom line)
      expect(result.colors[1].area).toBeCloseTo(700 * 90, -3); // blue only on the bottom allowance
      expect(result.panels.FRONT?.printArea).toBeCloseTo(200 * 490, 6);
    });

    it('counts an image straddling the LEFT | FRONT corner on both walls, once (cyclic wrap)', () => {
      // 100 × 100 mm red square centred on FRONT's left edge (wrap x 0 ≡ 700), y 150…250.
      const result = computeInkCoverage({
        dieline,
        panels: wrapInputs([
          {
            rows: [[RED]],
            placement: { mode: 'CUSTOM', offsetX: -350, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false },
          },
        ]),
        paperColor: 'WHITE',
        pantoneColors: palette,
      });
      expect(result.panels.FRONT?.inkArea).toBeCloseTo(50 * 100, -2);
      expect(result.panels.LEFT?.inkArea).toBeCloseTo(50 * 100, -2);
      expect(result.panels.RIGHT?.inkArea).toBe(0);
      expect(result.inkArea).toBeCloseTo(100 * 100, -2);
    });
  });
});
