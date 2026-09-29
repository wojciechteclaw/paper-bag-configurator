import { describe, expect, it } from 'vitest';
import { HANDLE_DEFAULTS } from '../config/productCatalog';
import type { Handle, HandleType } from '../types';
import {
  getHandleEndSpacing,
  getHandleLayout,
  getHandleLoopHeight,
  getHandlePatchRect,
  MIN_END_SPACING_FACTOR,
  PATCH_END_MARGIN,
  polylineLength,
  resolveHandleParams,
} from './handles';

const dims = { width: 200, height: 400, depth: 150 };
const handleOf = (type: HandleType, extra: Partial<Handle> = {}): Handle => ({
  id: 'h',
  type,
  ...HANDLE_DEFAULTS[type],
  ...extra,
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
  it('is W/2 clamped to 75…150 when the patch is wide enough', () => {
    expect(getHandleEndSpacing(200, 170, 'TWISTED_PAPER', 5)).toBe(100);
    expect(getHandleEndSpacing(100, 1000, 'TWISTED_PAPER', 5)).toBe(75);
    expect(getHandleEndSpacing(150, 1000, 'TWISTED_PAPER', 5)).toBe(75);
    expect(getHandleEndSpacing(300, 1000, 'TWISTED_PAPER', 5)).toBe(150);
    expect(getHandleEndSpacing(400, 1000, 'TWISTED_PAPER', 5)).toBe(150);
  });

  it('keeps twisted rope ends under the patch with the margin', () => {
    // 80 mm patch: 80 − 2·(5 + 2.5) = 65
    expect(getHandleEndSpacing(200, 80, 'TWISTED_PAPER', 5)).toBe(65);
  });

  it('keeps the flat strip legs and feet under the patch', () => {
    // reach = foot 1.2 · 15 = 18 → 170 − 2·(5 + 18) = 124; catalog 80 mm patch → 80 − 46 = 34
    expect(getHandleEndSpacing(260, 170, 'FLAT_PAPER', 15)).toBe(124);
    expect(getHandleEndSpacing(200, 80, 'FLAT_PAPER', 15)).toBe(34);
  });

  it('stays inside a narrow wall and never collapses below the minimum', () => {
    expect(getHandleEndSpacing(75, 75, 'TWISTED_PAPER', 5)).toBe(60);
    expect(getHandleEndSpacing(75, 20, 'FLAT_PAPER', 15)).toBe(MIN_END_SPACING_FACTOR * 15);
  });
});

describe('getHandleLoopHeight', () => {
  it('produces a loop whose arc length equals handle.length', () => {
    for (const [c, L] of [
      [65, 180],
      [100, 400],
      [150, 460],
    ]) {
      const b = getHandleLoopHeight(c, L);
      const layout = getHandleLayout(handleOf('TWISTED_PAPER', { length: L, patch: { width: c + 15, height: 50 } }), {
        width: 2 * c,
        height: 400,
        depth: 100,
      });
      expect(layout.endSpacing).toBeCloseTo(c, 6);
      expect(layout.loopHeight).toBeCloseTo(b, 6);
      const loop = layout.path.filter((p) => p.y >= 400);
      expect(polylineLength(loop)).toBeCloseTo(L, 0);
    }
  });

  it('grows with the length and shrinks with the spacing', () => {
    expect(getHandleLoopHeight(80, 300)).toBeGreaterThan(getHandleLoopHeight(80, 200));
    expect(getHandleLoopHeight(120, 250)).toBeLessThan(getHandleLoopHeight(60, 250));
  });

  it('is plausible for the defaults (≈ 80–100 mm, docs/PRODUCTION.md §5)', () => {
    const b = getHandleLoopHeight(65, 180);
    expect(b).toBeGreaterThan(70);
    expect(b).toBeLessThan(90);
  });

  it('keeps a minimum height when the length is shorter than the spacing', () => {
    expect(getHandleLoopHeight(100, 50)).toBeCloseTo(25);
    expect(getHandleLoopHeight(100, 0)).toBeCloseTo(25);
  });
});

describe('getHandlePatchRect', () => {
  it('uses the handle entity patch, centred, 3 mm below the top cut', () => {
    expect(getHandlePatchRect(handleOf('TWISTED_PAPER'), dims)).toEqual({ x0: -40, x1: 40, y0: 347, y1: 397 });
  });

  it('falls back to Lp = min(170, W − 20) × 45 without a patch', () => {
    const { patch: _patch, ...noPatch } = handleOf('TWISTED_PAPER');
    expect(getHandlePatchRect(noPatch, dims)).toEqual({ x0: -85, x1: 85, y0: 352, y1: 397 });
  });
});

describe('getHandleLayout', () => {
  for (const type of ['TWISTED_PAPER', 'FLAT_PAPER'] as const) {
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

      it('ends inside the patch with the margin (ends hidden under it)', () => {
        const w = layout.params.width;
        const legX = layout.endSpacing / 2;
        for (const p of layout.path.filter((q) => q.y < dims.height)) {
          // Legs extend w/2 sideways; the flat feet end at their centre-line tip.
          const outer = Math.abs(p.x) <= legX + 1e-9 ? Math.abs(p.x) + w / 2 : Math.abs(p.x);
          expect(outer).toBeLessThanOrEqual(layout.patch.x1 - PATCH_END_MARGIN + 1e-9);
          const bottom = type === 'FLAT_PAPER' ? p.y - w / 2 : p.y;
          expect(bottom).toBeGreaterThanOrEqual(layout.patch.y0 + PATCH_END_MARGIN - 1e-9);
        }
      });

      it('has no duplicate consecutive points', () => {
        for (let i = 1; i < layout.path.length; i++) {
          const d = Math.hypot(layout.path[i].x - layout.path[i - 1].x, layout.path[i].y - layout.path[i - 1].y);
          expect(d).toBeGreaterThan(1e-6);
        }
      });
    });
  }

  it('turns the flat strip ends outwards into feet', () => {
    const layout = getHandleLayout(handleOf('FLAT_PAPER'), dims);
    expect(layout.footLength).toBeGreaterThan(0);
    expect(layout.path[0].x).toBeCloseTo(-layout.endSpacing / 2 - layout.footLength);
    expect(layout.path[0].y).toBeCloseTo(layout.endY);
    expect(layout.footRadius).toBeGreaterThan(layout.params.width / 2);
  });

  it('ends the twisted rope vertically, above the patch bottom', () => {
    const layout = getHandleLayout(handleOf('TWISTED_PAPER'), dims);
    expect(layout.path[0]).toEqual({ x: -layout.endSpacing / 2, y: layout.patch.y0 + PATCH_END_MARGIN });
    expect(layout.footLength).toBe(0);
  });

  it('scales the spacing with a larger patch and wall', () => {
    const narrow = getHandleLayout(handleOf('TWISTED_PAPER', { patch: { width: 170, height: 45 } }), dims);
    const wide = getHandleLayout(handleOf('TWISTED_PAPER', { patch: { width: 170, height: 45 } }), {
      ...dims,
      width: 260,
    });
    expect(narrow.endSpacing).toBe(100);
    expect(wide.endSpacing).toBe(130);
  });
});
