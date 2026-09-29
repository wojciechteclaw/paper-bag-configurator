import { describe, expect, it } from 'vitest';
import { findRegion, getBottomPieces, getPanelRegions } from './blockBottom';
import {
  ASSEMBLY_PHASES,
  ASSEMBLY_TIMELINE_SHARE,
  assemblyInwardNormal,
  assemblyPoint,
  findAssemblyPiece,
  EAR_BEND_ANGLE,
  getAssemblyAngles,
  getAssemblyPhase,
  getMinFlapAngle,
  getAssemblyPieces,
  getAssemblyPose,
  getAssemblySheetOrigins,
  splitPreviewTimeline,
  toPreviewTimeline,
  type AssemblyPiece,
  type AssemblyPieceId,
  type AssemblyPose,
  type AssemblySheetPanel,
} from './assemblyKinematics';
import { foldPoint, getFoldPose, type Vec3 } from './foldKinematics';
import { polygonArea } from './sideGusset';

const dims = { width: 200, height: 400, depth: 150 }; // a = 90, h = 75, s = 10 → sheet 710 × 490
const a = 90;
const s = 10;
const pieces = getAssemblyPieces(dims);
const byId = Object.fromEntries(pieces.map((p) => [p.id, p])) as Record<AssemblyPieceId, AssemblyPiece>;
const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const at = (pose: AssemblyPose, id: AssemblyPieceId, u: number, v: number) => assemblyPoint(pose, byId[id], u, v);
const SAMPLES = [0, 0.1, 0.25, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const lerp = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

describe('assembly pieces', () => {
  it('tile the sheet exactly (walls + allowances + chamfered glue flap)', () => {
    const area = pieces.reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(area).toBeCloseTo(710 * 490 - s * s); // two 45° chamfers of s²/2 at the glue-flap ends
    pieces.forEach((p) => expect(polygonArea(p.polygon)).toBeGreaterThan(0)); // counter-clockwise, non-degenerate
    const perPanel = (panel: AssemblySheetPanel) =>
      pieces.filter((p) => p.panel === panel).reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(perPanel('LEFT')).toBeCloseTo(150 * 490);
    expect(perPanel('FRONT')).toBeCloseTo(200 * 490);
    expect(perPanel('GLUE')).toBeCloseTo(s * (490 - s));
  });

  it('split each side allowance into the middle triangle (apex D/2 deep) and two ears', () => {
    expect(byId.LEFT_TRIANGLE.polygon).toContainEqual({ x: 75, y: -75 });
    expect(Math.abs(polygonArea(byId.LEFT_TRIANGLE.polygon))).toBeCloseTo(150 * 75 / 2);
    // Each ear = corner part (on the flap's corner line) + diagonal part (on the triangle), split by its bend line.
    expect(findAssemblyPiece(pieces, 'LEFT', { x: 5, y: -80 })?.id).toBe('LEFT_EAR_BACK_CORNER');
    expect(findAssemblyPiece(pieces, 'LEFT', { x: 70, y: -80 })?.id).toBe('LEFT_EAR_BACK_DIAGONAL');
    expect(findAssemblyPiece(pieces, 'RIGHT', { x: 5, y: -80 })?.id).toBe('RIGHT_EAR_FRONT_CORNER');
    expect(findAssemblyPiece(pieces, 'RIGHT', { x: 145, y: -80 })?.id).toBe('RIGHT_EAR_BACK_CORNER');
    const ear = (id: string) =>
      pieces.filter((p) => p.id.startsWith(id)).reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(ear('LEFT_EAR_BACK')).toBeCloseTo(75 * 90 - (75 * 75) / 2); // D/2 × a minus half the triangle
    expect(ear('GLUE_EAR')).toBeCloseTo(s * (a - s)); // strip s × a − chamfer s²/2 − glue triangle s²/2
    expect(pieces.filter((p) => p.allowance).length).toBe(15); // 2 flaps + 3 triangles + 4 × 2 ear parts + 2 glue-ear parts
  });

  it('stacks the BACK flap outermost and the FRONT flap under it (client rule)', () => {
    expect(byId.BACK_FLAP.layer).toBe(0);
    expect(byId.FRONT_FLAP.layer).toBeGreaterThan(byId.BACK_FLAP.layer);
    expect(byId.LEFT_TRIANGLE.layer).toBeGreaterThan(byId.FRONT_FLAP.layer);
    expect(byId.LEFT_EAR_BACK_CORNER.host).toBe('BACK_FLAP');
    expect(byId.RIGHT_EAR_FRONT_DIAGONAL.host).toBe('FRONT_FLAP');
  });
});

describe('phases and timeline', () => {
  it('uses the client phase ranges A 0–0.4, B 0.4–0.6, C1 0.6–0.8, C2 0.8–1', () => {
    expect(ASSEMBLY_PHASES).toEqual({ TUBE: [0, 0.4], TRIANGLES: [0.4, 0.6], FRONT_FLAP: [0.6, 0.8], BACK_FLAP: [0.8, 1] });
    expect([0, 0.3, 0.5, 0.7, 0.9, 1].map(getAssemblyPhase)).toEqual([
      'TUBE',
      'TUBE',
      'TRIANGLES',
      'FRONT_FLAP',
      'BACK_FLAP',
      'BACK_FLAP',
    ]);
  });

  it('maps one timeline onto assembly (sheet → BOX) and fold (BOX → flat)', () => {
    expect(ASSEMBLY_TIMELINE_SHARE).toBe(0.4);
    expect(splitPreviewTimeline(0)).toEqual({ assemblyProgress: 0, foldProgress: 0 });
    expect(splitPreviewTimeline(0.2)).toEqual({ assemblyProgress: 0.5, foldProgress: 0 });
    expect(splitPreviewTimeline(0.4)).toEqual({ assemblyProgress: 1, foldProgress: 0 });
    expect(splitPreviewTimeline(0.55).foldProgress).toBeCloseTo(0.25);
    expect(splitPreviewTimeline(1)).toEqual({ assemblyProgress: 1, foldProgress: 1 });
    for (const t of lerp(0, 1, 20)) {
      const { assemblyProgress, foldProgress } = splitPreviewTimeline(t);
      expect(toPreviewTimeline(assemblyProgress, foldProgress)).toBeCloseTo(t, 12);
    }
    expect(toPreviewTimeline(1, 0.25)).toBeCloseTo(0.55, 12);
  });
});

describe('flat sheet (q = 0)', () => {
  it('puts every piece in one plane at its sheet coordinates, print side towards the viewer', () => {
    const pose = getAssemblyPose(dims, 0);
    const origins = getAssemblySheetOrigins(dims);
    for (const piece of pieces) {
      for (const p of piece.polygon) {
        const w = assemblyPoint(pose, piece, p.x, p.y);
        const sheetX = origins[piece.panel] + p.x;
        const sheetY = p.y + a;
        expect(w.x).toBeCloseTo(sheetX - dims.depth, 9);
        expect(w.y).toBeCloseTo(sheetY - a, 9);
        expect(w.z).toBeCloseTo(0, 9);
      }
      expect(assemblyInwardNormal(pose, { host: piece.id }).z).toBeCloseTo(-1, 9);
    }
    // Sheet centre in view, standing on the floor with the allowance.
    expect(pose.view).toEqual({ centreX: 710 / 2 - 150, centreZ: 0, lift: a });
  });
});

describe('formed bag (q = 1) = the BOX pose of the fold kinematics', () => {
  const pose = getAssemblyPose(dims, 1);
  const box = getFoldPose(dims, 0);

  it('places the walls exactly like the open box', () => {
    for (const panel of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
      const regions = getPanelRegions(panel, dims);
      const wall = pieces.find((p) => p.panel === panel && !p.allowance)!;
      for (const u of lerp(0, panel === 'FRONT' || panel === 'BACK' ? 200 : 150, 6)) {
        for (const v of lerp(0, 400, 8)) {
          const region = findRegion(regions, { x: u, y: v })!.id;
          expect(dist(assemblyPoint(pose, wall, u, v), foldPoint(box, panel, region, u, v))).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('lays every allowance piece onto the W × D bottom like getBottomPieces (tucks, ears, flaps)', () => {
    for (const piece of getBottomPieces(dims)) {
      for (const p of piece.polygon) {
        const onPanel = piece.toPanel(p);
        const inner = { x: onPanel.x, y: Math.min(onPanel.y, -1e-7) };
        // Nudge onto the piece interior side to pick the right assembly piece at shared boundaries.
        const candidates = pieces.filter(
          (q) => q.panel === piece.panel && q.allowance && findAssemblyPiece([q], piece.panel, inner, 1e-6),
        );
        expect(candidates.length).toBeGreaterThan(0);
        const expected = foldPoint(box, 'BOTTOM', 'BOTTOM', p.x, p.y);
        const ok = candidates.some((q) => dist(assemblyPoint(pose, q, onPanel.x, onPanel.y), expected) < 1e-9);
        expect(ok).toBe(true);
      }
    }
  });

  it('lays the glue flap on the inside of LEFT’s back strip (wall and bottom)', () => {
    for (const u of lerp(0, s, 4)) {
      for (const v of lerp(0, 390, 6)) expect(dist(at(pose, 'GLUE_WALL', u, v), at(pose, 'LEFT_WALL', u, v))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_TRIANGLE', u, -u / 2), at(pose, 'LEFT_TRIANGLE', u, -u / 2))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_EAR_CORNER', u / 2, -60), at(pose, 'LEFT_EAR_BACK_CORNER', u / 2, -60))).toBeLessThan(1e-9);
    }
  });

  it('turns the bottom inside faces up: BACK flap outermost, then FRONT flap, ears, triangles', () => {
    const up = (id: AssemblyPieceId) => assemblyInwardNormal(pose, byId[id]).y;
    for (const id of ['BACK_FLAP', 'FRONT_FLAP', 'LEFT_TRIANGLE', 'RIGHT_TRIANGLE', 'LEFT_EAR_BACK_CORNER', 'RIGHT_EAR_FRONT_DIAGONAL'] as const) {
      expect(up(id)).toBeCloseTo(1, 9);
    }
    expect(pose.view).toEqual({ centreX: 100, centreZ: -75, lift: 0 });
  });
});

describe('hinge continuity during the assembly (paper never cut, client: "one corner line pulls two walls")', () => {
  type Hinge = { name: string; a: AssemblyPieceId; b: AssemblyPieceId; points: [number, number, number, number][] };
  const along = (n: number, f: (t: number) => [number, number, number, number]) => lerp(0, 1, n).map(f);
  const bend = a * Math.tan(EAR_BEND_ANGLE);
  const hinges: Hinge[] = [
    // Tube edges C2 / C3 (wall | wall).
    { name: 'FRONT|LEFT', a: 'FRONT_WALL', b: 'LEFT_WALL', points: along(4, (t) => [0, 400 * t, 150, 400 * t]) },
    { name: 'FRONT|RIGHT', a: 'FRONT_WALL', b: 'RIGHT_WALL', points: along(4, (t) => [200, 400 * t, 0, 400 * t]) },
    { name: 'RIGHT|BACK', a: 'RIGHT_WALL', b: 'BACK_WALL', points: along(4, (t) => [150, 400 * t, 0, 400 * t]) },
    { name: 'BACK|GLUE (C3)', a: 'BACK_WALL', b: 'GLUE_WALL', points: along(4, (t) => [200, 400 * t, 0, 400 * t]) },
    // Bottom line C1 (wall | flap / triangle).
    { name: 'FRONT C1', a: 'FRONT_WALL', b: 'FRONT_FLAP', points: along(4, (t) => [200 * t, 0, 200 * t, 0]) },
    { name: 'BACK C1', a: 'BACK_WALL', b: 'BACK_FLAP', points: along(4, (t) => [200 * t, 0, 200 * t, 0]) },
    { name: 'LEFT C1', a: 'LEFT_WALL', b: 'LEFT_TRIANGLE', points: along(4, (t) => [150 * t, 0, 150 * t, 0]) },
    { name: 'RIGHT C1', a: 'RIGHT_WALL', b: 'RIGHT_TRIANGLE', points: along(4, (t) => [150 * t, 0, 150 * t, 0]) },
    { name: 'GLUE C1', a: 'GLUE_WALL', b: 'GLUE_TRIANGLE', points: along(2, (t) => [s * t, 0, s * t, 0]) },
    // Corner lines in the allowance (flap | ear), the continuation of the tube edges.
    { name: 'FRONT flap|LEFT ear', a: 'FRONT_FLAP', b: 'LEFT_EAR_FRONT_CORNER', points: along(4, (t) => [0, -a * t, 150, -a * t]) },
    { name: 'FRONT flap|RIGHT ear', a: 'FRONT_FLAP', b: 'RIGHT_EAR_FRONT_CORNER', points: along(4, (t) => [200, -a * t, 0, -a * t]) },
    { name: 'BACK flap|RIGHT ear', a: 'BACK_FLAP', b: 'RIGHT_EAR_BACK_CORNER', points: along(4, (t) => [0, -a * t, 150, -a * t]) },
    { name: 'BACK flap|glue ear (C3)', a: 'BACK_FLAP', b: 'GLUE_EAR_CORNER', points: along(4, (t) => [200, -a * t, 0, -a * t]) },
    // Lower diamond diagonals C7 (triangle | ear).
    { name: 'LEFT C7 back', a: 'LEFT_TRIANGLE', b: 'LEFT_EAR_BACK_DIAGONAL', points: along(4, (t) => [75 * t, -75 * t, 75 * t, -75 * t]) },
    { name: 'LEFT C7 front', a: 'LEFT_TRIANGLE', b: 'LEFT_EAR_FRONT_DIAGONAL', points: along(4, (t) => [150 - 75 * t, -75 * t, 150 - 75 * t, -75 * t]) },
    { name: 'RIGHT C7 front', a: 'RIGHT_TRIANGLE', b: 'RIGHT_EAR_FRONT_DIAGONAL', points: along(4, (t) => [75 * t, -75 * t, 75 * t, -75 * t]) },
    { name: 'RIGHT C7 back', a: 'RIGHT_TRIANGLE', b: 'RIGHT_EAR_BACK_DIAGONAL', points: along(4, (t) => [150 - 75 * t, -75 * t, 150 - 75 * t, -75 * t]) },
    // Ear bends (corner part | diagonal part).
    { name: 'LEFT back ear bend', a: 'LEFT_EAR_BACK_CORNER', b: 'LEFT_EAR_BACK_DIAGONAL', points: along(4, (t) => [bend * t, -a * t, bend * t, -a * t]) },
    { name: 'LEFT front ear bend', a: 'LEFT_EAR_FRONT_CORNER', b: 'LEFT_EAR_FRONT_DIAGONAL', points: along(4, (t) => [150 - bend * t, -a * t, 150 - bend * t, -a * t]) },
    { name: 'RIGHT front ear bend', a: 'RIGHT_EAR_FRONT_CORNER', b: 'RIGHT_EAR_FRONT_DIAGONAL', points: along(4, (t) => [bend * t, -a * t, bend * t, -a * t]) },
    { name: 'RIGHT back ear bend', a: 'RIGHT_EAR_BACK_CORNER', b: 'RIGHT_EAR_BACK_DIAGONAL', points: along(4, (t) => [150 - bend * t, -a * t, 150 - bend * t, -a * t]) },
  ];

  it.each(SAMPLES)('keeps every hinge closed at q = %s', (q) => {
    const pose = getAssemblyPose(dims, q);
    for (const hinge of hinges) {
      for (const [ua, va, ub, vb] of hinge.points) {
        const gap = dist(at(pose, hinge.a, ua, va), at(pose, hinge.b, ub, vb));
        expect(gap, `${hinge.name} at q = ${q}`).toBeLessThan(1e-9);
      }
    }
  });

  it.each([75, 150, 40])('keeps the hinges closed for other depths (D = %s)', (depth) => {
    const d = { width: 200, height: 300, depth };
    const ps = getAssemblyPieces(d);
    const find = (id: AssemblyPieceId) => ps.find((p) => p.id === id)!;
    const e = d.depth / 2;
    for (const q of [0.45, 0.7, 0.95]) {
      const pose = getAssemblyPose(d, q);
      for (const t of lerp(0, 1, 4)) {
        const tri = assemblyPoint(pose, find('LEFT_TRIANGLE'), e * t, -e * t);
        expect(dist(tri, assemblyPoint(pose, find('LEFT_EAR_BACK_DIAGONAL'), e * t, -e * t))).toBeLessThan(1e-9);
        const flap = assemblyPoint(pose, find('FRONT_FLAP'), 0, -pose.allowance * t);
        expect(dist(flap, assemblyPoint(pose, find('LEFT_EAR_FRONT_CORNER'), depth, -pose.allowance * t))).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps the LEFT back ear on the BACK flap corner once the tube is closed (seam)', () => {
    for (const q of SAMPLES.filter((x) => x >= 0.4)) {
      const pose = getAssemblyPose(dims, q);
      for (const t of lerp(0, 1, 4)) {
        expect(dist(at(pose, 'LEFT_EAR_BACK_CORNER', 0, -a * t), at(pose, 'BACK_FLAP', 200, -a * t))).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps the glue flap on the back strip of LEFT once the tube is closed (q ≥ 0.4)', () => {
    for (const q of SAMPLES.filter((x) => x >= 0.4)) {
      const pose = getAssemblyPose(dims, q);
      expect(dist(at(pose, 'GLUE_WALL', 5, 200), at(pose, 'LEFT_WALL', 5, 200))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_TRIANGLE', 8, -3), at(pose, 'LEFT_TRIANGLE', 8, -3))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_EAR_CORNER', 5, -50), at(pose, 'LEFT_EAR_BACK_CORNER', 5, -50))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_EAR_DIAGONAL', 9, -15), at(pose, 'LEFT_EAR_BACK_DIAGONAL', 9, -15))).toBeLessThan(1e-9);
    }
    // While the tube forms, the flap swings in with BACK (it only meets LEFT at the end of phase A).
    const mid = getAssemblyPose(dims, 0.2);
    expect(dist(at(mid, 'GLUE_WALL', 5, 200), at(mid, 'LEFT_WALL', 5, 200))).toBeGreaterThan(10);
  });

  it('only opens the short ear centre crease C5 (at most 2 · (a − D/2) = 30 mm, closed until the bottom starts)', () => {
    const slit = (q: number) => {
      const pose = getAssemblyPose(dims, q);
      return Math.max(
        ...lerp(-a, -75, 4).map((v) => dist(at(pose, 'LEFT_EAR_BACK_DIAGONAL', 75, v), at(pose, 'LEFT_EAR_FRONT_DIAGONAL', 75, v))),
      );
    };
    for (const q of [0, 0.2, 0.4]) expect(slit(q)).toBeLessThan(1e-9);
    for (const q of SAMPLES) expect(slit(q)).toBeLessThanOrEqual(2 * (a - 75) + 1e-9);
  });

  it('moves smoothly (no jumps between neighbouring timeline samples)', () => {
    let previous: Vec3[] | null = null;
    for (let q = 0; q <= 1.00001; q += 0.005) {
      const pose = getAssemblyPose(dims, q);
      const points = pieces.flatMap((piece) => piece.polygon.map((p) => ({ ...assemblyPoint(pose, piece, p.x, p.y) })));
      if (previous) {
        const before = previous;
        const jump = Math.max(...points.map((p, i) => dist(p, before[i])));
        expect(jump, `q = ${q.toFixed(3)}`).toBeLessThan(25); // the far glue-flap end swings ~15 mm per step in phase A
      }
      previous = points;
    }
  });

  it('moves each piece rigidly (edge lengths preserved)', () => {
    for (const q of [0.3, 0.55, 0.63, 0.9]) {
      const pose = getAssemblyPose(dims, q);
      for (const piece of pieces) {
        const flat = piece.polygon;
        const moved = flat.map((p) => ({ ...assemblyPoint(pose, piece, p.x, p.y) }));
        flat.forEach((p, i) => {
          const n = flat[(i + 1) % flat.length];
          expect(dist(moved[i], moved[(i + 1) % flat.length])).toBeCloseTo(Math.hypot(n.x - p.x, n.y - p.y), 9);
        });
      }
    }
  });

  it('closes the bottom with the triangles, the FRONT flap leading and the BACK flap last (on top)', () => {
    for (const q of SAMPLES) {
      const { triangles, frontFlap, backFlap } = getAssemblyAngles(q);
      expect(frontFlap).toBeLessThanOrEqual(triangles + 1e-12); // never passes through the triangle
      expect(backFlap).toBeLessThanOrEqual(frontFlap + 1e-12);
      // The 45° corner of the ear is never over-stretched: cos β cos δ + sin δ ≥ 1 for both flaps.
      for (const flap of [frontFlap, backFlap]) {
        expect(Math.cos(triangles) * Math.cos(flap) + Math.sin(flap)).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
    expect(getMinFlapAngle(0)).toBeCloseTo(0, 12);
    expect(getMinFlapAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
    const tip = (q: number, id: 'FRONT_FLAP' | 'BACK_FLAP') => at(getAssemblyPose(dims, q), id, 100, -a).y;
    expect(tip(0.4, 'FRONT_FLAP')).toBeCloseTo(-a, 9);
    expect(tip(0.7, 'FRONT_FLAP')).toBeGreaterThan(tip(0.7, 'BACK_FLAP') + 2);
    expect(tip(0.9, 'BACK_FLAP')).toBeLessThan(tip(0.9, 'FRONT_FLAP'));
    expect(tip(1, 'FRONT_FLAP')).toBeCloseTo(0, 9);
    expect(tip(1, 'BACK_FLAP')).toBeCloseTo(0, 9);
  });
});
