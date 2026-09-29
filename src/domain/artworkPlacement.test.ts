import { describe, expect, it } from 'vitest';
import {
  applyAffine,
  computePanelUvTransform,
  containPlacement,
  coverPlacement,
  FILL_PLACEMENT,
  getArtworkRect,
  getCoverScale,
  isSamePlacement,
  movePlacement,
  normalizePlacement,
  rotatePlacement,
  scalePlacement,
  toCustomPlacement,
  uvTransformToPanelMatrix,
  type PanelUvTransform,
} from './artworkPlacement';
import type { ArtworkPlacement, ArtworkRotation } from './types';

const panel = { width: 200, height: 400 };
const square = { width: 1000, height: 1000 };
const wide = { width: 2000, height: 1000 };

/** three.js: t = diag(repeat)·R(−rotation)·uv + offset (texture.center = (0,0)). */
function sample(uv: PanelUvTransform, u: number, v: number) {
  const c = Math.cos(uv.rotation);
  const s = Math.sin(uv.rotation);
  return {
    x: uv.repeat[0] * (c * u + s * v) + uv.offset[0],
    y: uv.repeat[1] * (-s * u + c * v) + uv.offset[1],
  };
}

describe('computePanelUvTransform', () => {
  it('maps FILL to the identity transform', () => {
    expect(computePanelUvTransform(panel, square, FILL_PLACEMENT)).toEqual({ repeat: [1, 1], offset: [0, 0], rotation: 0 });
  });

  it('falls back to identity for degenerate sizes', () => {
    expect(computePanelUvTransform(panel, { width: 0, height: 10 }, containPlacement())).toEqual({
      repeat: [1, 1],
      offset: [0, 0],
      rotation: 0,
    });
  });

  it('centres a contained square image on a 200 × 400 wall', () => {
    const uv = computePanelUvTransform(panel, square, containPlacement());
    expect(uv.repeat).toEqual([1, 2]);
    expect(uv.offset[0]).toBeCloseTo(0);
    expect(uv.offset[1]).toBeCloseTo(-0.5);
    // Image bottom edge at wall y = 100 mm (v = 0.25), top at y = 300 mm (v = 0.75).
    expect(sample(uv, 0.5, 0.25).y).toBeCloseTo(0);
    expect(sample(uv, 0.5, 0.75).y).toBeCloseTo(1);
  });

  const rotations: ArtworkRotation[] = [0, 90, 180, 270];
  it.each(rotations)('agrees with the geometric image rectangle at rotation %i°', (rotation) => {
    const placement: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 12, offsetY: -30, scale: 0.7, rotation };
    const uv = computePanelUvTransform(panel, wide, placement);
    const rect = getArtworkRect(panel, wide, placement);
    const rad = (rotation * Math.PI) / 180;
    // Image corner (tx, ty) → wall point: centre + R(θ)·((tx − ½)·w, (ty − ½)·h).
    for (const [tx, ty] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [0.25, 0.8],
    ]) {
      const lx = (tx - 0.5) * rect.width;
      const ly = (ty - 0.5) * rect.height;
      const px = rect.center.x + Math.cos(rad) * lx - Math.sin(rad) * ly;
      const py = rect.center.y + Math.sin(rad) * lx + Math.cos(rad) * ly;
      const t = sample(uv, px / panel.width, py / panel.height);
      expect(t.x).toBeCloseTo(tx);
      expect(t.y).toBeCloseTo(ty);
      // …and the inverse matrix used by the dieline maps it back.
      const back = applyAffine(uvTransformToPanelMatrix(panel, uv), { x: tx, y: ty });
      expect(back.x).toBeCloseTo(px);
      expect(back.y).toBeCloseTo(py);
    }
  });

  it('inverse of FILL maps the unit square onto the whole wall', () => {
    const m = uvTransformToPanelMatrix(panel, computePanelUvTransform(panel, square, FILL_PLACEMENT));
    expect(applyAffine(m, { x: 1, y: 1 })).toEqual({ x: 200, y: 400 });
    expect(applyAffine(m, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('placement helpers', () => {
  it('contain keeps the whole image on the wall; rotation-aware', () => {
    expect(getArtworkRect(panel, wide, containPlacement())).toMatchObject({ width: 200, height: 100 });
    // Rotated by 90° the 2:1 image stands up: 400 tall (its width), 200 wide.
    expect(getArtworkRect(panel, wide, containPlacement(90))).toMatchObject({ width: 400, height: 200 });
  });

  it('cover fills the whole wall', () => {
    expect(getCoverScale(panel, wide)).toBe(4);
    const rect = getArtworkRect(panel, wide, coverPlacement(panel, wide));
    expect(rect.width).toBeCloseTo(800);
    expect(rect.height).toBeCloseTo(400);
  });

  it('turns FILL into a centred contain placement when editing starts', () => {
    expect(toCustomPlacement(FILL_PLACEMENT)).toEqual(containPlacement());
    expect(movePlacement(FILL_PLACEMENT, 5, -3, panel)).toEqual({ mode: 'CUSTOM', offsetX: 5, offsetY: -3, scale: 1, rotation: 0 });
  });

  it('scales, rotates and moves within limits', () => {
    expect(scalePlacement(containPlacement(), 2, panel)).toMatchObject({ scale: 2 });
    expect(scalePlacement(containPlacement(), 1000, panel)).toMatchObject({ scale: 10 });
    expect(scalePlacement(containPlacement(), 0, panel)).toMatchObject({ scale: 0.05 });
    expect(rotatePlacement(containPlacement(270), panel)).toMatchObject({ rotation: 0 });
    expect(rotatePlacement(containPlacement(0), panel, -1)).toMatchObject({ rotation: 270 });
    expect(movePlacement(containPlacement(), 500, -500, panel)).toMatchObject({ offsetX: 100, offsetY: -200 });
  });

  it('normalizes non-finite and off-grid values', () => {
    const bad = { mode: 'CUSTOM', offsetX: Number.NaN, offsetY: Infinity, scale: Number.NaN, rotation: 100 } as unknown as ArtworkPlacement;
    expect(normalizePlacement(bad, panel)).toEqual({ mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 90 });
    expect(normalizePlacement(FILL_PLACEMENT, panel)).toEqual(FILL_PLACEMENT);
  });

  it('compares placements', () => {
    expect(isSamePlacement(FILL_PLACEMENT, { mode: 'FILL' })).toBe(true);
    expect(isSamePlacement(FILL_PLACEMENT, containPlacement())).toBe(false);
    expect(isSamePlacement(containPlacement(), containPlacement())).toBe(true);
  });
});
