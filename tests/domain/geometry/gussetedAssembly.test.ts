import { describe, expect, it } from 'vitest';
import { buildGussetedDieline } from '../../../src/domain/dieline';
import { pointInConvexPolygon } from '../../../src/domain/geometry/blockBottom';
import {
  getGussetedLayerSteps,
  getGussetedMaxMouthHalfDepth,
  getGussetedOpenShape,
  getGussetedPhase,
  getGussetedPieces,
  getGussetedPose,
  getGussetedSheetOrigins,
  GUSSETED_PHASES,
  GUSSETED_PRODUCTION_SHARE,
  gussetedPoint,
  gussetedPrintNormal,
  splitGussetedTimeline,
  toGussetedTimeline,
  type GussetedPiece,
  type GussetedPose,
} from '../../../src/domain/geometry/gussetedAssembly';
import type { Vec3 } from '../../../src/domain/geometry/gussetedBag';

// Client example 140 + 90 × 370, s = 15, plus the d range ends and a large gusset.
const CASES = [
  { dims: { width: 140, height: 370, depth: 90, bottomFold: 25 }, s: 15 },
  { dims: { width: 150, height: 250, depth: 60, bottomFold: 15 }, s: 15 },
  { dims: { width: 200, height: 400, depth: 200, bottomFold: 30 }, s: 20 },
];
const SAMPLES = [0, 0.03, 0.1, 0.2, 0.25, 0.31, 0.37, 0.4, 0.47, 0.55, 0.6, 0.7, 0.8, 0.93, 1];
const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const at = (pose: GussetedPose, piece: GussetedPiece, x: number, y: number) => gussetedPoint(pose, piece, x, y, { x: 0, y: 0, z: 0 });

describe('gusseted sheet pieces', () => {
  it('tile the sheet of the dieline exactly (column origins and areas)', () => {
    for (const { dims, s } of CASES) {
      const dieline = buildGussetedDieline({ dimensions: dims, glueFlapWidth: s, bottomFoldDepth: dims.bottomFold });
      const origins = getGussetedSheetOrigins(dims);
      for (const segment of dieline.segments) expect(origins[segment.panel as 'LEFT']).toBeCloseTo(segment.x0, 9);
      expect(origins.GLUE).toBeCloseTo(dieline.glueFlap.x, 9);
      const area = getGussetedPieces(dims, s).reduce((sum, p) => {
        let a = 0;
        p.polygon.forEach((v, i) => {
          const w = p.polygon[(i + 1) % p.polygon.length];
          a += v.x * w.y - w.x * v.y;
        });
        expect(a).toBeGreaterThan(0); // counter-clockwise seen from the print side
        return sum + a / 2;
      }, 0);
      expect(area).toBeCloseTo(dieline.sheet.width * dieline.sheet.height, 6);
    }
  });
});

describe('gusseted timeline', () => {
  it('runs production (sheet → flat bag at 60 %) and then the opening, phases on the 1 % grid', () => {
    expect(GUSSETED_PRODUCTION_SHARE).toBe(0.6);
    expect(Object.values(GUSSETED_PHASES).map(([start]) => start)).toEqual([0, 0.2, 0.4, 0.6]);
    expect(getGussetedPhase(0)).toBe('TUCK');
    expect(getGussetedPhase(0.2)).toBe('WRAP');
    expect(getGussetedPhase(0.5)).toBe('BOTTOM');
    expect(getGussetedPhase(1)).toBe('OPEN');
    expect(splitGussetedTimeline(0.3)).toEqual({ assemblyProgress: 0.5, foldProgress: 1 });
    expect(splitGussetedTimeline(0.6)).toEqual({ assemblyProgress: 1, foldProgress: 1 });
    expect(splitGussetedTimeline(1)).toEqual({ assemblyProgress: 1, foldProgress: 0 });
    for (const t of SAMPLES) {
      const { assemblyProgress, foldProgress } = splitGussetedTimeline(t);
      expect(toGussetedTimeline(assemblyProgress, foldProgress)).toBeCloseTo(t, 12);
    }
  });
});

describe('gusseted forming and opening kinematics', () => {
  it('starts as the flat sheet in z = 0 (dieline layout, FRONT centred)', () => {
    for (const { dims, s } of CASES) {
      const pose = getGussetedPose(dims, s, 0);
      const origins = getGussetedSheetOrigins(dims);
      for (const piece of getGussetedPieces(dims, s)) {
        for (const v of piece.polygon) {
          const p = at(pose, piece, v.x, v.y);
          expect(p.x).toBeCloseTo(origins[piece.column] + v.x - dims.depth - dims.width / 2, 9);
          expect(p.y).toBeCloseTo(v.y, 9);
          expect(p.z).toBeCloseTo(0, 9);
        }
        expect(gussetedPrintNormal(pose, piece).z).toBeCloseTo(1, 12);
        expect(getGussetedLayerSteps(pose, piece)).toBeCloseTo(0, 12);
      }
    }
  });

  it('keeps every hinge closed at every t (pieces sharing sheet points share 3D points)', () => {
    for (const { dims, s } of CASES) {
      const pieces = getGussetedPieces(dims, s);
      const origins = getGussetedSheetOrigins(dims);
      for (const t of SAMPLES) {
        const pose = getGussetedPose(dims, s, t);
        for (const a of pieces) {
          for (const v of a.polygon) {
            const sheet = { x: origins[a.column] + v.x, y: v.y };
            for (const b of pieces) {
              if (b === a) continue;
              const local = { x: sheet.x - origins[b.column], y: sheet.y };
              if (!pointInConvexPolygon(local, b.polygon, 1e-7)) continue;
              expect(dist(at(pose, a, v.x, v.y), at(pose, b, local.x, local.y))).toBeLessThan(1e-6);
            }
          }
        }
      }
    }
  });

  it('is continuous across every phase boundary', () => {
    const { dims, s } = CASES[0];
    const pieces = getGussetedPieces(dims, s);
    for (const boundary of [0.2, 0.4, 0.6]) {
      const before = getGussetedPose(dims, s, boundary - 1e-7);
      const after = getGussetedPose(dims, s, boundary + 1e-7);
      for (const piece of pieces) {
        for (const v of piece.polygon) expect(dist(at(before, piece, v.x, v.y), at(after, piece, v.x, v.y))).toBeLessThan(1e-3);
      }
    }
  });

  it('closes the seam: from the end of the wrap the flap lies on LB (the gusset half next to BACK)', () => {
    for (const { dims, s } of CASES) {
      const pieces = getGussetedPieces(dims, s);
      const lb = pieces.filter((p) => p.link === 'LB');
      for (const t of [0.4, 0.5, 0.6, 0.8, 1]) {
        const pose = getGussetedPose(dims, s, t);
        for (const flap of pieces.filter((p) => p.link === 'GLUE')) {
          for (const v of flap.polygon) {
            const host = lb.find((p) => pointInConvexPolygon(v, p.polygon, 1e-7))!;
            expect(dist(at(pose, flap, v.x, v.y), at(pose, host, v.x, v.y))).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it('is the flat bag of the dieline at 60 %: W wide, gussets tucked F/2, height H, strip folded onto the back', () => {
    for (const { dims, s } of CASES) {
      const { width: W, height: H, depth: F, bottomFold: d } = dims;
      const pose = getGussetedPose(dims, s, GUSSETED_PRODUCTION_SHARE);
      const pieces = getGussetedPieces(dims, s);
      const points = pieces.flatMap((piece) => piece.polygon.map((v) => ({ piece, p: at(pose, piece, v.x, v.y) })));
      for (const { p } of points) {
        expect(p.z).toBeCloseTo(0, 9);
        expect(p.x).toBeGreaterThanOrEqual(-W / 2 - 1e-9);
        expect(p.x).toBeLessThanOrEqual(W / 2 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(H + 1e-9);
      }
      for (const { piece, p } of points) if (piece.strip) expect(p.y).toBeLessThanOrEqual(d + 1e-9);
      const creaseRight = pieces.find((p) => p.id === 'RF_CREASE')!;
      expect(at(pose, creaseRight, F / 2, H).x).toBeCloseTo(W / 2 - F / 2, 9);
      const creaseLeft = pieces.find((p) => p.id === 'LB_CREASE')!;
      expect(at(pose, creaseLeft, F / 2, H).x).toBeCloseTo(-W / 2 + F / 2, 9);
      // Print sides: FRONT +z, BACK −z; FRONT's strip outermost on the back, print side out.
      expect(gussetedPrintNormal(pose, pieces.find((p) => p.id === 'FRONT_UPPER')!).z).toBeCloseTo(1, 9);
      expect(gussetedPrintNormal(pose, pieces.find((p) => p.id === 'BACK_UPPER')!).z).toBeCloseTo(-1, 9);
      expect(gussetedPrintNormal(pose, pieces.find((p) => p.id === 'FRONT_STRIP')!).z).toBeCloseTo(-1, 9);
    }
  });

  it('stacks the render layers of the flat bag in order, ≤ 0.1 mm (one step) apart', () => {
    const { dims, s } = CASES[0];
    const pose = getGussetedPose(dims, s, GUSSETED_PRODUCTION_SHARE);
    const pieces = getGussetedPieces(dims, s);
    const z = (id: string) => {
      const piece = pieces.find((p) => p.id === id)!;
      return getGussetedLayerSteps(pose, piece) * gussetedPrintNormal(pose, piece).z;
    };
    // Walls front → back (right side, left side, seam flap between LB and BACK).
    expect(z('FRONT_BAND')).toBeCloseTo(1.5, 9);
    expect(z('RF_BAND')).toBeCloseTo(0.5, 9);
    expect(z('RB_BAND')).toBeCloseTo(-0.5, 9);
    expect(z('LF_BAND')).toBeCloseTo(0.5, 9);
    expect(z('LB_BAND')).toBeCloseTo(-0.5, 9);
    expect(z('GLUE_BAND')).toBeCloseTo(-1, 9);
    expect(z('BACK_BAND')).toBeCloseTo(-1.5, 9);
    // Folded strips outside BACK: BACK, flap, gusset halves next to BACK, next to FRONT, FRONT outermost.
    expect([z('BACK_STRIP'), z('GLUE_STRIP'), z('RB_STRIP'), z('RF_STRIP'), z('FRONT_STRIP')]).toEqual(
      [-2.5, -3, -3.5, -4.5, -5.5].map((v) => expect.closeTo(v, 9)),
    );
  });

  it('opens to the mouth W × F at 100 % with rigid, non-crossing facets (wedge, flat glued bottom)', () => {
    for (const { dims, s } of CASES) {
      const { width: W, height: H, depth: F, bottomFold: d } = dims;
      const pose = getGussetedPose(dims, s, 1);
      const pieces = getGussetedPieces(dims, s);
      const piece = (id: string) => pieces.find((p) => p.id === id)!;
      const zf = getGussetedMaxMouthHalfDepth(dims);
      expect(zf).toBeCloseTo(F / 2, 12);
      const top = pose.open.topY;
      expect(top).toBeCloseTo(d + Math.sqrt((H - d) ** 2 - (F / 2) ** 2), 9);
      // Mouth corners and gusset crease tops: the rectangle W × F.
      expect(at(pose, piece('FRONT_UPPER'), 0, H)).toMatchObject({ x: expect.closeTo(-W / 2, 9), y: expect.closeTo(top, 9), z: expect.closeTo(F / 2, 9) });
      expect(at(pose, piece('BACK_UPPER'), 0, H)).toMatchObject({ x: expect.closeTo(W / 2, 9), z: expect.closeTo(-F / 2, 9) });
      for (const id of ['RF_CREASE', 'LB_CREASE']) {
        const c = at(pose, piece(id), F / 2, H);
        expect(Math.abs(c.x)).toBeCloseTo(W / 2, 9);
        expect(c.y).toBeCloseTo(top, 9);
        expect(c.z).toBeCloseTo(0, 9);
      }
      // The glued band stays flat; the strip stays folded on the back.
      expect(at(pose, piece('FRONT_BAND'), 10, d).z).toBeCloseTo(0, 9);
      expect(at(pose, piece('FRONT_STRIP'), 10, -d).y).toBeCloseTo(d, 9);
      // The crease triangle lies between the bag's centre plane and FRONT (inside the bag, never through FRONT).
      const tan = Math.tan(pose.open.tilt);
      for (const [u, v] of [
        [0.1, 0.8],
        [0.3, 0.3],
        [0.45, 0.1],
      ]) {
        const x = F / 2 - (F / 2) * u;
        const y = H - (H - d) * v * (1 - u);
        const p = at(pose, piece('RF_CREASE'), Math.max(x, (F / 2) * (H - y) / (H - d)), y);
        expect(p.z).toBeGreaterThanOrEqual(-1e-9);
        expect(p.z).toBeLessThanOrEqual((p.y - d) * tan + 1e-6);
        expect(p.x).toBeLessThanOrEqual(W / 2 + 1e-9);
      }
    }
  });

  it('opens monotonically: the mouth depth grows and the crease top rises to the side edge', () => {
    const { dims } = CASES[0];
    let previous = getGussetedOpenShape(dims, 0);
    expect(previous.creaseTop.x).toBeCloseTo(dims.width / 2 - dims.depth / 2, 9);
    expect(previous.creaseTop.y).toBeCloseTo(dims.height, 9);
    for (let zf = 5; zf <= dims.depth / 2; zf += 5) {
      const shape = getGussetedOpenShape(dims, zf);
      expect(shape.creaseTop.x).toBeGreaterThan(previous.creaseTop.x);
      expect(shape.topY).toBeLessThan(previous.topY);
      previous = shape;
    }
  });

  it('never produces NaN, also for degenerate input', () => {
    for (const pose of [
      getGussetedPose({ width: 100, height: 170, depth: 100, bottomFold: 30 }, 20, 1),
      getGussetedPose({ width: 0, height: 0, depth: 0 }, Number.NaN, Number.NaN),
    ]) {
      for (const m of Object.values(pose.transforms)) {
        for (const v of [...m.r, m.t.x, m.t.y, m.t.z]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
