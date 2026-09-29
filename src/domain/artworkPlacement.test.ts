import { describe, expect, it } from 'vitest';
import {
  alignPlacement,
  applyAffine,
  computePanelUvTransform,
  containPlacement,
  coverPlacement,
  FILL_PLACEMENT,
  fillPlacement,
  getPanelArtworkArea,
  getArtworkRect,
  getCoverScale,
  isSamePlacement,
  movePlacement,
  normalizePlacement,
  rotatePlacement,
  scalePlacement,
  setPlacementExtendToBottom,
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
    const placement: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 12, offsetY: -30, scale: 0.7, rotation, extendToBottom: false };
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
    expect(movePlacement(FILL_PLACEMENT, 5, -3, panel)).toEqual({ mode: 'CUSTOM', offsetX: 5, offsetY: -3, scale: 1, rotation: 0, extendToBottom: false });
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
    expect(normalizePlacement(bad, panel)).toEqual({ mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 90, extendToBottom: false });
    expect(normalizePlacement(FILL_PLACEMENT, panel)).toEqual(FILL_PLACEMENT);
  });

  it('compares placements', () => {
    expect(isSamePlacement(FILL_PLACEMENT, { mode: 'FILL', extendToBottom: false })).toBe(true);
    expect(isSamePlacement(FILL_PLACEMENT, containPlacement())).toBe(false);
    expect(isSamePlacement(containPlacement(), containPlacement())).toBe(true);
  });
});

describe('artwork area and "extend to bottom" (SPEC §4f)', () => {
  const dims = { width: 200, height: 400, depth: 150 }; // a = (150 + 30) / 2 = 90
  const extended = { width: 200, height: 490 };

  it('is the visible wall by default and wall + allowance when extended', () => {
    expect(getPanelArtworkArea('FRONT', dims, FILL_PLACEMENT)).toEqual({ x: 0, y: 0, width: 200, height: 400 });
    expect(getPanelArtworkArea('BACK', dims, fillPlacement(true))).toEqual({ x: 0, y: -90, width: 200, height: 490 });
    expect(getPanelArtworkArea('LEFT', dims, containPlacement(0, true))).toEqual({ x: 0, y: -90, width: 150, height: 490 });
  });

  it('stretches FILL over H + a, continuing the wall UV space below v = 0', () => {
    const area = getPanelArtworkArea('FRONT', dims, fillPlacement(true));
    const uv = computePanelUvTransform(panel, square, fillPlacement(true), area);
    // Bottom of the allowance (y = −90, v = −90/400) → t = 0; top of the wall (v = 1) → t = 1; bottom line → a/(H+a).
    expect(sample(uv, 0, -90 / 400)).toEqual({ x: 0, y: 0 });
    expect(sample(uv, 1, 1).x).toBeCloseTo(1);
    expect(sample(uv, 1, 1).y).toBeCloseTo(1);
    expect(sample(uv, 0.5, 0).y).toBeCloseTo(90 / 490);
    // The inverse (dieline) maps the unit square onto the extended area.
    const m = uvTransformToPanelMatrix(panel, uv);
    expect(applyAffine(m, { x: 0, y: 0 }).y).toBeCloseTo(-90);
    expect(applyAffine(m, { x: 1, y: 1 }).y).toBeCloseTo(400);
  });

  it('keeps a CUSTOM image in place (same rect in mm) when the extension is toggled', () => {
    const wallArea = getPanelArtworkArea('FRONT', dims, FILL_PLACEMENT);
    const extArea = getPanelArtworkArea('FRONT', dims, fillPlacement(true));
    const before: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 10, offsetY: 20, scale: 0.5, rotation: 90, extendToBottom: false };
    const after = setPlacementExtendToBottom(before, true, wallArea, extArea, wide);
    expect(after.extendToBottom).toBe(true);
    const r0 = getArtworkRect(panel, wide, before, wallArea);
    const r1 = getArtworkRect(panel, wide, after, extArea);
    expect(r1.center.x).toBeCloseTo(r0.center.x);
    expect(r1.center.y).toBeCloseTo(r0.center.y);
    expect(r1.width).toBeCloseTo(r0.width);
    expect(r1.height).toBeCloseTo(r0.height);
    // …and the UV transforms agree too.
    const uv0 = computePanelUvTransform(panel, wide, before, wallArea);
    const uv1 = computePanelUvTransform(panel, wide, after, extArea);
    expect(uv1.repeat[0]).toBeCloseTo(uv0.repeat[0]);
    expect(uv1.offset[1]).toBeCloseTo(uv0.offset[1]);
    // FILL just switches the flag; toggling back restores the wall placement.
    expect(setPlacementExtendToBottom(FILL_PLACEMENT, true, wallArea, extArea, wide)).toEqual(fillPlacement(true));
    const back = setPlacementExtendToBottom(after, false, extArea, wallArea, wide) as Extract<ArtworkPlacement, { mode: 'CUSTOM' }>;
    expect(back.offsetX).toBeCloseTo(10);
    expect(back.offsetY).toBeCloseTo(20);
    expect(back.scale).toBeCloseTo(0.5);
  });

  it('keeps the flag through editing helpers and compares it', () => {
    expect(movePlacement(fillPlacement(true), 1, 1, extended)).toMatchObject({ mode: 'CUSTOM', extendToBottom: true });
    expect(normalizePlacement({ mode: 'FILL' } as unknown as ArtworkPlacement, panel)).toEqual(FILL_PLACEMENT);
    expect(isSamePlacement(fillPlacement(true), FILL_PLACEMENT)).toBe(false);
  });
});

describe('alignPlacement (3 × 3)', () => {
  // Square 1000 px image on a 200 × 400 wall: contain → 200 × 200, vertical slack 100 mm each side.
  it.each([
    [{ horizontal: 'LEFT', vertical: 'TOP' }, 0, 100],
    [{ horizontal: 'CENTER', vertical: 'MIDDLE' }, 0, 0],
    [{ horizontal: 'RIGHT', vertical: 'BOTTOM' }, 0, -100],
  ] as const)('aligns %o from FILL (switches to CUSTOM contain)', (alignment, x, y) => {
    const result = alignPlacement(FILL_PLACEMENT, alignment, panel, square);
    expect(result).toEqual({ mode: 'CUSTOM', offsetX: x, offsetY: y, scale: 1, rotation: 0, extendToBottom: false });
  });

  it('touches the edges with a smaller, wide image and keeps the other axis when one is omitted', () => {
    const small: ArtworkPlacement = { mode: 'CUSTOM', offsetX: 7, offsetY: 9, scale: 0.5, rotation: 0, extendToBottom: false };
    // 2:1 image, contain on 200 × 400 → 200 × 100; scale 0.5 → 100 × 50.
    const left = alignPlacement(small, { horizontal: 'LEFT' }, panel, wide);
    expect(left).toMatchObject({ offsetX: -50, offsetY: 9 });
    const rect = getArtworkRect(panel, wide, left);
    expect(rect.center.x - rect.width / 2).toBeCloseTo(0);
    const top = alignPlacement(small, { vertical: 'TOP' }, panel, wide);
    expect(top).toMatchObject({ offsetX: 7, offsetY: 175 });
  });

  it('uses the rotated bounding box', () => {
    // 2:1 image turned 90°: contain = 200 wide × 400 tall (fills the wall); at scale 0.5 → 100 × 200.
    const rotated: ArtworkPlacement = { ...toCustomPlacement(containPlacement(90)), scale: 0.5 };
    expect(alignPlacement(rotated, { horizontal: 'RIGHT', vertical: 'BOTTOM' }, panel, wide)).toMatchObject({
      offsetX: 50,
      offsetY: -100,
    });
  });

  it('aligns BOTTOM to the lower edge of the bottom allowance when extended', () => {
    const dims = { width: 200, height: 400, depth: 150 };
    const area = getPanelArtworkArea('FRONT', dims, fillPlacement(true));
    const aligned = alignPlacement(fillPlacement(true), { vertical: 'BOTTOM' }, area, square);
    const rect = getArtworkRect(panel, square, aligned, area);
    expect(rect.center.y - rect.height / 2).toBeCloseTo(-90);
    expect(aligned.extendToBottom).toBe(true);
  });
});
