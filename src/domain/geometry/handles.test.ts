import { describe, expect, it } from 'vitest';
import { HANDLE_DEFAULTS } from '../config/productCatalog';
import type { Handle, HandleType } from '../types';
import {
  getHandleEndSpacing,
  getHandleLayout,
  getHandleLoopHeight,
  getHandlePatchRect,
  HANDLE_LOOP_HEIGHT_MM,
  HANDLE_OUTER_WIDTH_MM,
  handleEndSpacingFor,
  PATCH_OVERHANG_MM,
  MIN_END_SPACING_FACTOR,
  PATCH_END_MARGIN,
  polylineLength,
  resolveHandleParams,
  getHandlePaperColor,
} from './handles';

const dims = { width: 200, height: 400, depth: 150 };
const TYPES = ['TWISTED_PAPER', 'FLAT_PAPER'] as const;
const handleOf = (type: HandleType, extra: Partial<Handle> = {}): Handle => ({
  id: 'h',
  type,
  ...HANDLE_DEFAULTS[type],
  ...extra,
});

describe('catalog handle defaults [K]', () => {
  it('uses a 110 × 20 mm patch (90 mm handle + 2 × 10 mm) for both types and a 20 mm flat strip', () => {
    for (const type of TYPES) expect(HANDLE_DEFAULTS[type].patch).toEqual({ width: 110, height: 20 });
    expect(HANDLE_DEFAULTS.FLAT_PAPER.width).toBe(20);
    expect(HANDLE_DEFAULTS.TWISTED_PAPER.width).toBe(5);
  });
});

describe('resolveHandleParams', () => {
  it('fills missing or invalid values from the catalog defaults', () => {
    const p = resolveHandleParams({ id: 'x', type: 'FLAT_PAPER', material: 'KRAFT', width: 0, length: Number.NaN });
    expect(p.width).toBe(HANDLE_DEFAULTS.FLAT_PAPER.width);
    expect(p.length).toBe(HANDLE_DEFAULTS.FLAT_PAPER.length);
    expect(p.color).toBe(HANDLE_DEFAULTS.FLAT_PAPER.color);
  });

  it('keeps explicit values', () => {
    const p = resolveHandleParams(handleOf('TWISTED_PAPER', { width: 4, length: 300, color: '#ffffff' }));
    expect(p).toMatchObject({ width: 4, length: 300, color: '#ffffff' });
  });
});

describe('getHandleEndSpacing', () => {
  it('keeps the handle 90 mm wide over its outer edges, with the patch 10 mm past it on each side [K]', () => {
    expect(HANDLE_OUTER_WIDTH_MM).toBe(90);
    expect(PATCH_OVERHANG_MM).toBe(10);
    for (const W of [120, 150, 200, 260, 400]) {
      expect(getHandleEndSpacing(W, 110, 5)).toBe(85); // rope Ø5: centre lines 85 apart → outer 90
      expect(getHandleEndSpacing(W, 110, 20)).toBe(70); // 20 mm strip: centre lines 70 apart → outer 90
    }
    for (const w of [5, 20]) {
      const outer = getHandleEndSpacing(200, 110, w) + w;
      expect(outer).toBe(90);
      expect((110 - outer) / 2).toBe(PATCH_OVERHANG_MM);
    }
  });

  it('is reduced on walls narrower than the patch so the ends stay under it', () => {
    // W = 75 → patch clamped to 75 − 2·5 = 65 mm; keeping the 10 mm overhang leaves 45 mm for the handle:
    // 45 − 5 = 40 (rope); strip: 45 − 20 = 25, but never below 2 strip widths → 40.
    expect(getHandleEndSpacing(75, 65, 5)).toBe(40);
    expect(getHandleEndSpacing(75, 65, 20)).toBe(MIN_END_SPACING_FACTOR * 20);
    // W = 100 → patch 90: 70 mm for the handle → 50 (strip), 65 (rope).
    expect(getHandleEndSpacing(100, 90, 20)).toBe(50);
    expect(getHandleEndSpacing(100, 90, 5)).toBe(65);
  });

  it('never collapses below the minimum', () => {
    expect(getHandleEndSpacing(75, 20, 20)).toBe(MIN_END_SPACING_FACTOR * 20);
  });
});

describe('loop height [K]', () => {
  it.each(TYPES)('%s: the loop is always 50 mm above the top edge, its length follows from it', (type) => {
    expect(HANDLE_LOOP_HEIGHT_MM).toBe(50);
    for (const L of [120, 180, 300]) {
      const layout = getHandleLayout(handleOf(type, { length: L }), dims);
      expect(layout.loopHeight).toBe(50);
      const top = layout.path.reduce((m, p) => (p.y > m.y ? p : m));
      expect(top.y).toBeCloseTo(dims.height + 50, 6);
      const loop = layout.path.filter((p) => p.y >= dims.height);
      expect(layout.loopLength).toBeCloseTo(polylineLength(loop), 3);
    }
  });
});

describe('getHandleLoopHeight (length → height helper)', () => {

  it('grows with the length and shrinks with the spacing', () => {
    expect(getHandleLoopHeight(80, 300)).toBeGreaterThan(getHandleLoopHeight(80, 200));
    expect(getHandleLoopHeight(120, 250)).toBeLessThan(getHandleLoopHeight(60, 250));
  });

  it('is plausible for the defaults (80 mm spacing, 180 mm loop)', () => {
    const b = getHandleLoopHeight(80, 180);
    expect(b).toBeGreaterThan(65);
    expect(b).toBeLessThan(80);
  });

  it('keeps a minimum height when the length is shorter than the spacing', () => {
    expect(getHandleLoopHeight(100, 50)).toBeCloseTo(25);
    expect(getHandleLoopHeight(100, 0)).toBeCloseTo(25);
  });
});

describe('getHandlePatchRect', () => {
  it.each(TYPES)('%s: 110 × 20 mm, centred, 20 mm below the top cut → [H − 40, H − 20]', (type) => {
    expect(getHandlePatchRect(handleOf(type), dims)).toEqual({ x0: -55, x1: 55, y0: 360, y1: 380 });
  });

  it('uses the same 110 × 20 mm rule when the handle entity has no patch', () => {
    const { patch: _patch, ...noPatch } = handleOf('TWISTED_PAPER');
    expect(getHandlePatchRect(noPatch, dims)).toEqual({ x0: -55, x1: 55, y0: 360, y1: 380 });
  });

  it('keeps 5 mm from the side creases on narrow walls (W − 10)', () => {
    expect(getHandlePatchRect(handleOf('FLAT_PAPER'), { ...dims, width: 75 })).toMatchObject({ x0: -32.5, x1: 32.5 });
    expect(getHandlePatchRect(handleOf('FLAT_PAPER'), { ...dims, width: 110 })).toMatchObject({ x0: -50, x1: 50 });
  });
});

describe('getHandleLayout', () => {
  const widths = [75, 90, 95, 100, 110, 150, 200, 260]; // W range 75–260 mm

  for (const type of TYPES) {
    describe(type, () => {
      const layout = getHandleLayout(handleOf(type), dims);
      const first = layout.path[0];
      const last = layout.path[layout.path.length - 1];

      it('is symmetric about the wall centre', () => {
        expect(first.x).toBeCloseTo(-last.x, 9);
        expect(first.y).toBeCloseTo(last.y, 9);
        const top = layout.path.reduce((m, p) => (p.y > m.y ? p : m));
        expect(top.x).toBeCloseTo(0, 6);
        expect(top.y).toBeCloseTo(dims.height + layout.loopHeight, 6);
      });

      it('ends vertically with outer edges at ±45 mm (90 mm handle), PATCH_END_MARGIN above the patch bottom', () => {
        const w = layout.params.width;
        expect(layout.endSpacing).toBe(90 - w);
        expect(layout.endSpacingReduced).toBe(false);
        expect(first).toEqual({ x: -(90 - w) / 2, y: layout.patch.y0 + PATCH_END_MARGIN });
        // The patch overhangs the handle's outer edge by 10 mm on each side.
        expect(layout.patch.x1 - (Math.abs(first.x) + w / 2)).toBeCloseTo(10, 9);
        expect(layout.endY).toBe(365);
      });

      it.each(widths)('keeps the ends under the patch on a %d mm wall (90 mm unless the wall is too narrow)', (W) => {
        const l = getHandleLayout(handleOf(type), { ...dims, width: W });
        const w = l.params.width;
        const patchWidth = Math.min(110, W - 10);
        const wanted = handleEndSpacingFor(w);
        const fits = patchWidth - 2 * PATCH_OVERHANG_MM - w >= wanted;
        expect(l.patch.x1 - l.patch.x0).toBe(patchWidth);
        expect(l.patch.x1).toBeLessThanOrEqual(W / 2 - 5);
        expect(l.endSpacingReduced).toBe(!fits);
        if (fits) expect(l.endSpacing).toBe(wanted);
        else expect(l.endSpacing).toBeLessThan(wanted);
        if (W >= 120) expect(l.endSpacing).toBe(wanted);
        for (const p of l.path.filter((q) => q.y < dims.height)) {
          expect(Math.abs(p.x) + w / 2).toBeLessThanOrEqual(l.patch.x1 + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(l.patch.y0 + PATCH_END_MARGIN - 1e-9);
        }
        // The cut end itself lies under the patch.
        expect(l.endY).toBeGreaterThanOrEqual(l.patch.y0);
        expect(l.endY).toBeLessThanOrEqual(l.patch.y1);
      });

      it('has no duplicate consecutive points', () => {
        for (let i = 1; i < layout.path.length; i++) {
          const d = Math.hypot(layout.path[i].x - layout.path[i - 1].x, layout.path[i].y - layout.path[i - 1].y);
          expect(d).toBeGreaterThan(1e-6);
        }
      });
    });
  }

  it('places the 20 mm flat strip within 90 mm (legs span |x| ∈ [25, 45]) and the patch 10 mm past it', () => {
    const layout = getHandleLayout(handleOf('FLAT_PAPER'), dims);
    const legX = layout.endSpacing / 2;
    expect(legX - layout.params.width / 2).toBe(25);
    expect(legX + layout.params.width / 2).toBe(45);
    expect(layout.patch.x1 - 45).toBe(10);
  });

  it('keeps the loop height independent of the wall width (fixed spacing)', () => {
    const a = getHandleLayout(handleOf('TWISTED_PAPER'), dims);
    const b = getHandleLayout(handleOf('TWISTED_PAPER'), { ...dims, width: 260 });
    expect(b.endSpacing).toBe(a.endSpacing);
    expect(b.loopHeight).toBeCloseTo(a.loopHeight, 9);
  });
});

describe('handle paper colour (client rule)', () => {
  it('follows the bag paper colour — white or brown', () => {
    expect(getHandlePaperColor({ color: 'WHITE' })).toBe('WHITE');
    expect(getHandlePaperColor({ color: 'BROWN' })).toBe('BROWN');
  });
});
