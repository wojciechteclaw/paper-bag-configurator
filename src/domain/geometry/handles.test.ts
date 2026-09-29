import { describe, expect, it } from 'vitest';
import { HANDLE_DEFAULTS } from '../config/productCatalog';
import type { Handle, HandleType } from '../types';
import {
  getHandleEndSpacing,
  getHandleLayout,
  getHandleLoopHeight,
  getHandlePatchRect,
  HANDLE_END_SPACING_MM,
  MIN_END_SPACING_FACTOR,
  PATCH_END_MARGIN,
  polylineLength,
  resolveHandleParams,
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
  it('uses a 100 × 20 mm patch for both types and a 20 mm flat strip', () => {
    for (const type of TYPES) expect(HANDLE_DEFAULTS[type].patch).toEqual({ width: 100, height: 20 });
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
  it('is fixed at 80 mm whenever the patch fits the spacing', () => {
    expect(HANDLE_END_SPACING_MM).toBe(80);
    for (const W of [100, 150, 200, 260, 400]) {
      expect(getHandleEndSpacing(W, 100, 5)).toBe(80);
      expect(getHandleEndSpacing(W, 100, 20)).toBe(80); // 20 mm strip: edges flush with the 100 mm patch
    }
  });

  it('is reduced on walls narrower than the patch so the ends stay under it', () => {
    // W = 75 → patch clamped to 75 − 2·5 = 65 mm: 65 − 5 = 60 (rope), 65 − 20 = 45 (strip).
    expect(getHandleEndSpacing(75, 65, 5)).toBe(60);
    expect(getHandleEndSpacing(75, 65, 20)).toBe(45);
    expect(getHandleEndSpacing(100, 90, 20)).toBe(70);
    expect(getHandleEndSpacing(100, 90, 5)).toBe(80);
  });

  it('never collapses below the minimum', () => {
    expect(getHandleEndSpacing(75, 20, 20)).toBe(MIN_END_SPACING_FACTOR * 20);
  });
});

describe('getHandleLoopHeight', () => {
  it('produces a loop whose arc length equals handle.length', () => {
    for (const L of [180, 300, 460]) {
      const layout = getHandleLayout(handleOf('TWISTED_PAPER', { length: L }), dims);
      expect(layout.endSpacing).toBe(80);
      expect(layout.loopHeight).toBeCloseTo(getHandleLoopHeight(80, L), 6);
      const loop = layout.path.filter((p) => p.y >= dims.height);
      expect(polylineLength(loop)).toBeCloseTo(L, 0);
    }
  });

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
  it.each(TYPES)('%s: 100 × 20 mm, centred, 20 mm below the top cut → [H − 40, H − 20]', (type) => {
    expect(getHandlePatchRect(handleOf(type), dims)).toEqual({ x0: -50, x1: 50, y0: 360, y1: 380 });
  });

  it('uses the same 100 × 20 mm rule when the handle entity has no patch', () => {
    const { patch: _patch, ...noPatch } = handleOf('TWISTED_PAPER');
    expect(getHandlePatchRect(noPatch, dims)).toEqual({ x0: -50, x1: 50, y0: 360, y1: 380 });
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

      it('ends vertically at x = ±40 mm, PATCH_END_MARGIN above the patch bottom', () => {
        expect(layout.endSpacing).toBe(80);
        expect(layout.endSpacingReduced).toBe(false);
        expect(first).toEqual({ x: -40, y: layout.patch.y0 + PATCH_END_MARGIN });
        expect(layout.endY).toBe(365);
      });

      it.each(widths)('keeps the ends under the patch on a %d mm wall (80 mm unless the wall is too narrow)', (W) => {
        const l = getHandleLayout(handleOf(type), { ...dims, width: W });
        const w = l.params.width;
        const patchWidth = Math.min(100, W - 10);
        const fits = patchWidth - w >= HANDLE_END_SPACING_MM;
        expect(l.patch.x1 - l.patch.x0).toBe(patchWidth);
        expect(l.patch.x1).toBeLessThanOrEqual(W / 2 - 5);
        expect(l.endSpacingReduced).toBe(!fits);
        expect(l.endSpacing).toBe(fits ? HANDLE_END_SPACING_MM : patchWidth - w);
        if (W >= 110) expect(l.endSpacing).toBe(80);
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

  it('fits the 20 mm flat strip exactly across the 100 mm patch (legs span |x| ∈ [30, 50])', () => {
    const layout = getHandleLayout(handleOf('FLAT_PAPER'), dims);
    const legX = layout.endSpacing / 2;
    expect(legX - layout.params.width / 2).toBe(30);
    expect(legX + layout.params.width / 2).toBe(layout.patch.x1);
  });

  it('keeps the loop height independent of the wall width (fixed spacing)', () => {
    const a = getHandleLayout(handleOf('TWISTED_PAPER'), dims);
    const b = getHandleLayout(handleOf('TWISTED_PAPER'), { ...dims, width: 260 });
    expect(b.endSpacing).toBe(a.endSpacing);
    expect(b.loopHeight).toBeCloseTo(a.loopHeight, 9);
  });
});
