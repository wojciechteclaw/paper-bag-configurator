import { describe, expect, it } from 'vitest';
import { buildGussetedDieline } from '../../../src/domain/dieline';
import {
  getGussetedFlapWidth,
  getGussetedPhase,
  getGussetedPose,
  getGussetedSheetOrigins,
  GUSSETED_PHASES,
  GUSSETED_TIMELINE_SHARE,
  gussetedPosePoint,
  splitGussetedTimeline,
  toGussetedTimeline,
  type GussetedSheetPart,
} from '../../../src/domain/geometry/gussetedAssembly';
import { getGussetedPoint, type Vec3 } from '../../../src/domain/geometry/gussetedBag';

// Client example 140 + 90 × 370, s = 15, plus the d range ends and a large gusset.
const CASES = [
  { dims: { width: 140, height: 370, depth: 90, bottomFold: 25 }, s: 15 },
  { dims: { width: 150, height: 250, depth: 60, bottomFold: 15 }, s: 15 },
  { dims: { width: 200, height: 400, depth: 200, bottomFold: 30 }, s: 20 },
];
const Q_SAMPLES = [0, 0.05, 0.2, 0.25, 0.3, 0.42, 0.5, 0.55, 0.7, 0.75, 0.8, 0.95, 1];
const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

/** Sample points of every sheet part (panel-local; the flap in u), including its edges and the crease / fold lines. */
function samples(dims: (typeof CASES)[number]['dims'], s: number): { part: GussetedSheetPart; x: number; y: number }[] {
  const { width: W, height: H, depth: F, bottomFold: d } = dims;
  const ys = [-d, -d / 2, 0, d / 2, d, H / 3, H];
  const out: { part: GussetedSheetPart; x: number; y: number }[] = [];
  for (const y of ys) {
    for (const x of [0, W / 3, W]) out.push({ part: 'FRONT', x, y }, { part: 'BACK', x, y });
    for (const x of [0, F / 4, F / 2, (3 * F) / 4, F]) out.push({ part: 'LEFT', x, y }, { part: 'RIGHT', x, y });
    for (const x of [0, s / 2, getGussetedFlapWidth(dims, s)]) out.push({ part: 'GLUE', x, y });
  }
  return out;
}

describe('gusseted timeline split (forming 0–60 %, fold 60–100 %)', () => {
  it('maps the timeline both ways; the phases start on the 1 % grid', () => {
    expect(GUSSETED_TIMELINE_SHARE).toBe(0.6);
    expect(Object.values(GUSSETED_PHASES).map(([start]) => Number((start * GUSSETED_TIMELINE_SHARE).toFixed(4)))).toEqual([0, 0.15, 0.3, 0.45]);
    expect(splitGussetedTimeline(0.3)).toEqual({ assemblyProgress: 0.5, foldProgress: 0 });
    expect(splitGussetedTimeline(0.6)).toEqual({ assemblyProgress: 1, foldProgress: 0 });
    expect(splitGussetedTimeline(0.8).foldProgress).toBeCloseTo(0.5, 12);
    for (const t of [0, 0.1, 0.37, 0.6, 0.75, 1]) {
      const { assemblyProgress, foldProgress } = splitGussetedTimeline(t);
      expect(toGussetedTimeline(assemblyProgress, foldProgress)).toBeCloseTo(t, 12);
    }
    expect(getGussetedPhase(0)).toBe('TUCK');
    expect(getGussetedPhase(0.3)).toBe('WRAP');
    expect(getGussetedPhase(0.6)).toBe('BOTTOM');
    expect(getGussetedPhase(0.9)).toBe('OPEN');
  });

  it('matches the sheet columns of the dieline (LEFT | FRONT | RIGHT | BACK | s)', () => {
    for (const { dims, s } of CASES) {
      const dieline = buildGussetedDieline({ dimensions: dims, glueFlapWidth: s, bottomFoldDepth: dims.bottomFold });
      const origins = getGussetedSheetOrigins(dims);
      for (const segment of dieline.segments) expect(origins[segment.panel]).toBeCloseTo(segment.x0, 9);
      expect(origins.GLUE).toBeCloseTo(dieline.glueFlap.x, 9);
    }
  });
});

describe('gusseted forming kinematics', () => {
  it('starts as the flat sheet in z = 0, FRONT in place, the strip hanging below the bottom line', () => {
    for (const { dims, s } of CASES) {
      const pose = getGussetedPose(dims, s, 0, 0, 0.4);
      const origins = getGussetedSheetOrigins(dims);
      for (const { part, x, y } of samples(dims, s)) {
        const p = gussetedPosePoint(pose, part, x, y);
        expect(p.x).toBeCloseTo(origins[part] + x - dims.depth - dims.width / 2, 9);
        expect(p.y).toBeCloseTo(y, 9);
        expect(p.z).toBeCloseTo(0, 9);
      }
      expect(pose.view.lift).toBe(dims.bottomFold);
    }
  });

  it('keeps every hinge closed at every q (exact geometry): shared sheet edges stay together', () => {
    for (const { dims, s } of CASES) {
      const { width: W, height: H, depth: F } = dims;
      for (const q of Q_SAMPLES) {
        const pose = getGussetedPose(dims, s, q);
        for (const y of [-dims.bottomFold, 0, H / 2, H]) {
          const at = (part: GussetedSheetPart, x: number) => gussetedPosePoint(pose, part, x, y);
          // Tube edges LEFT|FRONT, FRONT|RIGHT, RIGHT|BACK; gusset centres (both halves' side); seam flap hinge C3.
          expect(dist(at('LEFT', F), at('FRONT', 0))).toBeLessThan(1e-6);
          expect(dist(at('FRONT', W), at('RIGHT', 0))).toBeLessThan(1e-6);
          expect(dist(at('RIGHT', F), at('BACK', 0))).toBeLessThan(1e-6);
          expect(dist(at('RIGHT', F / 2 - 1e-9), at('RIGHT', F / 2 + 1e-9))).toBeLessThan(1e-6);
          expect(dist(at('LEFT', F / 2 - 1e-9), at('LEFT', F / 2 + 1e-9))).toBeLessThan(1e-6);
          expect(dist(at('BACK', W), at('GLUE', 0))).toBeLessThan(1e-6);
        }
        // The bottom line: wall and strip meet (exact geometry, no layer gap).
        for (const part of ['FRONT', 'LEFT', 'RIGHT', 'BACK', 'GLUE'] as const) {
          expect(dist(gussetedPosePoint(pose, part, 3, 0), gussetedPosePoint(pose, part, 3, -1e-9))).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('keeps the paper rigid in the forming (distances within every gusset half and wall)', () => {
    const { dims, s } = CASES[0];
    const { width: W, depth: F, height: H } = dims;
    for (const q of [0.1, 0.3, 0.45]) {
      const pose = getGussetedPose(dims, s, q);
      const at = (part: GussetedSheetPart, x: number, y: number) => gussetedPosePoint(pose, part, x, y);
      expect(dist(at('RIGHT', 0, 0), at('RIGHT', F / 2, H))).toBeCloseTo(Math.hypot(F / 2, H), 9);
      expect(dist(at('LEFT', F / 2, 0), at('LEFT', F, H))).toBeCloseTo(Math.hypot(F / 2, H), 9);
      expect(dist(at('BACK', 0, -dims.bottomFold), at('BACK', W, H))).toBeCloseTo(Math.hypot(W, H + dims.bottomFold), 9);
    }
  });

  it('is continuous across every phase boundary (with the render gap)', () => {
    for (const { dims, s } of CASES) {
      for (const boundary of [0.25, 0.5, 0.75, 1]) {
        const before = getGussetedPose(dims, s, boundary - 1e-7, 0, 0.4);
        const after = boundary < 1 ? getGussetedPose(dims, s, boundary + 1e-7, 0, 0.4) : getGussetedPose(dims, s, 1, 1e-7, 0.4);
        for (const { part, x, y } of samples(dims, s)) {
          expect(dist(gussetedPosePoint(before, part, x, y), gussetedPosePoint(after, part, x, y))).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('forms the flat tube at the end of the wrap: the gusseted model, flat, strip still hanging; the flap lies on LB', () => {
    for (const { dims, s } of CASES) {
      const pose = getGussetedPose(dims, s, GUSSETED_PHASES.WRAP[1]);
      for (const { part, x, y } of samples(dims, s)) {
        const expected = getGussetedPoint(dims, part === 'GLUE' ? 'LEFT' : part, { x, y }, 0, 0, 0);
        expect(dist(gussetedPosePoint(pose, part, x, y), expected)).toBeLessThan(1e-6);
      }
      // W wide, the gussets tucked in by F/2.
      expect(gussetedPosePoint(pose, 'RIGHT', dims.depth / 2, 10).x).toBeCloseTo(dims.width / 2 - dims.depth / 2, 9);
      expect(gussetedPosePoint(pose, 'LEFT', dims.depth / 2, 10).x).toBeCloseTo(-dims.width / 2 + dims.depth / 2, 9);
      expect(pose.view.centreX).toBeCloseTo(0, 12);
    }
  });

  it('folds the strip to the back and ends EXACTLY in the open bag of the gusseted model (the fold starts there)', () => {
    for (const { dims, s } of CASES) {
      const flat = getGussetedPose(dims, s, GUSSETED_PHASES.BOTTOM[1], 0, 0.4);
      const open = getGussetedPose(dims, s, 1, 0, 0.4);
      for (const { part, x, y } of samples(dims, s)) {
        if (part === 'GLUE') continue;
        expect(gussetedPosePoint(flat, part, x, y)).toEqual(getGussetedPoint(dims, part, { x, y }, 0, 0.4));
        expect(gussetedPosePoint(open, part, x, y)).toEqual(getGussetedPoint(dims, part, { x, y }, 1, 0.4));
      }
      // The fold p is the gusseted model's (open = 1 − p).
      const folding = getGussetedPose(dims, s, 1, 0.3, 0.4);
      expect(gussetedPosePoint(folding, 'BACK', 20, 200)).toEqual(getGussetedPoint(dims, 'BACK', { x: 20, y: 200 }, 0.7, 0.4));
      // The strip lies on the back (y ∈ [0, d]).
      expect(gussetedPosePoint(flat, 'FRONT', 10, -dims.bottomFold).y).toBeCloseTo(dims.bottomFold, 9);
      expect(flat.view.lift).toBe(0);
    }
  });

  it('keeps the seam flap inside LB (between LB and BACK in the flat tube), at most 0.1 mm off it', () => {
    const { dims, s } = CASES[0];
    for (const q of [0.5, 0.75, 1]) {
      const pose = getGussetedPose(dims, s, q, 0, 0.4);
      for (const y of [-10, 5, 100, dims.height]) {
        for (const u of [2, s / 2, s]) {
          const flap = gussetedPosePoint(pose, 'GLUE', u, y);
          const lb = gussetedPosePoint(pose, 'LEFT', u, y);
          expect(dist(flap, lb)).toBeLessThanOrEqual(0.1 + 1e-9);
        }
      }
    }
    const flat = getGussetedPose(dims, s, 0.5, 0, 0.4);
    const flap = gussetedPosePoint(flat, 'GLUE', s, 100);
    expect(flap.z).toBeLessThan(gussetedPosePoint(flat, 'LEFT', s, 100).z);
    expect(flap.z).toBeGreaterThan(gussetedPosePoint(flat, 'BACK', dims.width - s, 100).z);
  });

  it('never produces NaN, also for degenerate input', () => {
    for (const pose of [getGussetedPose({ width: 100, height: 170, depth: 100, bottomFold: 30 }, 20, 0.6, 0, 0.4), getGussetedPose({ width: 0, height: 0, depth: 0 }, Number.NaN, Number.NaN, Number.NaN, Number.NaN)]) {
      for (const part of ['FRONT', 'LEFT', 'RIGHT', 'BACK', 'GLUE'] as const) {
        const p = gussetedPosePoint(pose, part, 1, 1);
        expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
      }
    }
  });
});
