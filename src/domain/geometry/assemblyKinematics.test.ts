import { describe, expect, it } from 'vitest';
import { findRegion, getBottomPieces, getPanelRegions } from './blockBottom';
import {
  ASSEMBLY_PHASES,
  ASSEMBLY_TIMELINE_SHARE,
  assemblyInwardNormal,
  assemblyPoint,
  EAR_BEND_ANGLE,
  findAssemblyPiece,
  getAssemblyAngles,
  getAssemblyPhase,
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

const dims = { width: 200, height: 400, depth: 150 }; // E = 90, s = 10 → sheet 710 × 490
const E = 90;
const s = 10;
const pieces = getAssemblyPieces(dims);
const byId = Object.fromEntries(pieces.map((p) => [p.id, p])) as Record<AssemblyPieceId, AssemblyPiece>;
const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const at = (pose: AssemblyPose, id: AssemblyPieceId, u: number, v: number) => assemblyPoint(pose, byId[id], u, v);
const SAMPLES = [0, 0.1, 0.25, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
const lerp = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
const bend = E * Math.tan(EAR_BEND_ANGLE);

describe('assembly pieces', () => {
  it('tile the sheet exactly (walls + bottom zones + chamfered glue flap)', () => {
    const area = pieces.reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(area).toBeCloseTo(710 * 490 - s * s); // two 45° chamfers of s²/2 at the glue-flap ends
    pieces.forEach((p) => expect(polygonArea(p.polygon)).toBeGreaterThan(0)); // counter-clockwise, non-degenerate
    const perPanel = (panel: AssemblySheetPanel) =>
      pieces.filter((p) => p.panel === panel).reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(perPanel('LEFT')).toBeCloseTo(150 * 490);
    expect(perPanel('FRONT')).toBeCloseTo(200 * 490);
    expect(perPanel('BACK')).toBeCloseTo(200 * 490);
    expect(perPanel('GLUE')).toBeCloseTo(s * (490 - s));
  });

  it('keeps the side zones whole and splits FRONT / BACK zones into trapezoid + corner triangles (client model [K])', () => {
    expect(byId.LEFT_SIDE_FLAP.polygon).toEqual([
      { x: 0, y: -90 },
      { x: 150, y: -90 },
      { x: 150, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(pieces.filter((p) => p.panel === 'LEFT' && p.allowance)).toHaveLength(1);
    expect(byId.FRONT_TRAPEZOID.polygon).toEqual([
      { x: 0, y: 0 },
      { x: 90, y: -90 },
      { x: 110, y: -90 },
      { x: 200, y: 0 },
    ]);
    // Each corner triangle = CORNER part (on the tube corner edge) + DIAGONAL part (on the 45° crease), split by its bend.
    expect(findAssemblyPiece(pieces, 'FRONT', { x: 5, y: -80 })?.id).toBe('FRONT_EAR_LEFT_CORNER');
    expect(findAssemblyPiece(pieces, 'FRONT', { x: 70, y: -85 })?.id).toBe('FRONT_EAR_LEFT_DIAGONAL');
    expect(findAssemblyPiece(pieces, 'BACK', { x: 5, y: -80 })?.id).toBe('BACK_EAR_RIGHT_CORNER');
    expect(findAssemblyPiece(pieces, 'BACK', { x: 195, y: -80 })?.id).toBe('BACK_EAR_LEFT_CORNER');
    const ear = (id: string) => pieces.filter((p) => p.id.startsWith(id)).reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(ear('FRONT_EAR_LEFT')).toBeCloseTo((E * E) / 2);
    expect(ear('BACK_EAR_LEFT')).toBeCloseTo((E * E) / 2);
    expect(pieces.filter((p) => p.allowance)).toHaveLength(13); // 2 trapezoids + 4 × 2 ear parts + 2 side flaps + glue
  });

  it('links every zone piece to its piece of the formed bottom, with its layer', () => {
    const bottom = Object.fromEntries(getBottomPieces(dims).map((p) => [p.id, p])) as Record<string, { layer: number }>;
    for (const piece of pieces.filter((p) => p.allowance && p.panel !== 'GLUE')) {
      expect(piece.bottomPiece).toBeDefined();
      expect(piece.layer).toBe(bottom[piece.bottomPiece!].layer);
    }
    expect(byId.FRONT_EAR_LEFT_DIAGONAL.host).toBe('FRONT_TRAPEZOID');
    expect(byId.BACK_EAR_LEFT_CORNER.host).toBe('BACK_TRAPEZOID');
  });

  it('stacks side flaps innermost, then FRONT ears, FRONT trapezoid, BACK ears, BACK trapezoid outermost [K]', () => {
    const order: AssemblyPieceId[] = [
      'BACK_TRAPEZOID',
      'BACK_EAR_LEFT_CORNER',
      'FRONT_TRAPEZOID',
      'FRONT_EAR_LEFT_CORNER',
      'LEFT_SIDE_FLAP',
      'GLUE_BOTTOM',
    ];
    const layers = order.map((id) => byId[id].layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(new Set(layers).size).toBe(layers.length);
    expect(byId.RIGHT_SIDE_FLAP.layer).toBe(byId.LEFT_SIDE_FLAP.layer);
  });

  it('degrades a narrow bag (W < D + 30) without NaN: trapezoid → triangle, ears → quadrilaterals', () => {
    const narrow = { width: 120, height: 300, depth: 110 };
    const ps = getAssemblyPieces(narrow);
    expect(ps.find((p) => p.id === 'FRONT_TRAPEZOID')!.polygon).toHaveLength(3);
    const total = ps.reduce((sum, p) => sum + polygonArea(p.polygon), 0);
    expect(total).toBeCloseTo((2 * 120 + 2 * 110 + 10) * (300 + 70) - 100, 6);
    for (const q of [0, 0.3, 0.5, 0.7, 0.9, 1]) {
      const pose = getAssemblyPose(narrow, q);
      for (const piece of ps) {
        for (const p of piece.polygon) {
          const w = assemblyPoint(pose, piece, p.x, p.y);
          expect(Number.isFinite(w.x) && Number.isFinite(w.y) && Number.isFinite(w.z)).toBe(true);
        }
      }
    }
  });
});

describe('phases and timeline', () => {
  it('runs the client order A tube, B sides, C1 front trapezoid, C2 back trapezoid', () => {
    expect(ASSEMBLY_PHASES).toEqual({ TUBE: [0, 0.4], SIDES: [0.4, 0.6], FRONT_TRAPEZOID: [0.6, 0.8], BACK_TRAPEZOID: [0.8, 1] });
    expect([0, 0.3, 0.5, 0.7, 0.9, 1].map(getAssemblyPhase)).toEqual([
      'TUBE',
      'TUBE',
      'SIDES',
      'FRONT_TRAPEZOID',
      'BACK_TRAPEZOID',
      'BACK_TRAPEZOID',
    ]);
  });

  it('turns strictly one phase after the other (sides in before either trapezoid leaves the vertical)', () => {
    for (const q of lerp(0, 1, 100)) {
      const { tube, sides, frontTrapezoid, backTrapezoid } = getAssemblyAngles(q);
      if (sides > 0) expect(tube).toBeCloseTo(Math.PI / 2, 12);
      if (frontTrapezoid > 0) expect(sides).toBeCloseTo(Math.PI / 2, 12);
      if (backTrapezoid > 0) expect(frontTrapezoid).toBeCloseTo(Math.PI / 2, 12);
    }
    expect(getAssemblyAngles(1)).toEqual({ tube: Math.PI / 2, sides: Math.PI / 2, frontTrapezoid: Math.PI / 2, backTrapezoid: Math.PI / 2 });
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
        expect(w.x).toBeCloseTo(origins[piece.panel] + p.x - dims.depth, 9);
        expect(w.y).toBeCloseTo(p.y, 9);
        expect(w.z).toBeCloseTo(0, 9);
      }
      expect(assemblyInwardNormal(pose, { host: piece.id }).z).toBeCloseTo(-1, 9);
    }
    // Sheet centre in view, standing on the floor with the zones.
    expect(pose.view).toEqual({ centreX: 710 / 2 - 150, centreZ: 0, lift: E });
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

  it('lays every zone piece onto the W × D bottom exactly where getBottomPieces puts it', () => {
    const bottom = Object.fromEntries(getBottomPieces(dims).map((p) => [p.id, p]));
    for (const piece of pieces.filter((p) => p.bottomPiece)) {
      const target = bottom[piece.bottomPiece!];
      for (const p of piece.polygon) {
        const b = target.fromPanel(p);
        expect(dist(assemblyPoint(pose, piece, p.x, p.y), foldPoint(box, 'BOTTOM', 'BOTTOM', b.x, b.y))).toBeLessThan(1e-9);
      }
    }
  });

  it('lays the glue flap on the inside of LEFT (wall strip and side flap)', () => {
    for (const u of lerp(0, s, 4)) {
      for (const v of lerp(0, 390, 6)) expect(dist(at(pose, 'GLUE_WALL', u, v), at(pose, 'LEFT_WALL', u, v))).toBeLessThan(1e-9);
      for (const v of lerp(-80, 0, 4)) expect(dist(at(pose, 'GLUE_BOTTOM', u, v), at(pose, 'LEFT_SIDE_FLAP', u, v))).toBeLessThan(1e-9);
    }
  });

  it('turns the bottom inside up; the corner triangles lie turned over (print side up, inside the bag)', () => {
    for (const id of ['BACK_TRAPEZOID', 'FRONT_TRAPEZOID', 'LEFT_SIDE_FLAP', 'RIGHT_SIDE_FLAP', 'GLUE_BOTTOM', 'FRONT_EAR_LEFT_CORNER'] as const) {
      expect(assemblyInwardNormal(pose, byId[id]).y).toBeCloseTo(1, 9);
    }
    for (const id of ['FRONT_EAR_LEFT_CORNER', 'FRONT_EAR_RIGHT_DIAGONAL', 'BACK_EAR_LEFT_CORNER', 'BACK_EAR_RIGHT_DIAGONAL'] as const) {
      expect(assemblyInwardNormal(pose, { host: id }).y).toBeCloseTo(-1, 9); // own inside faces down: turned over
    }
    expect(pose.view).toEqual({ centreX: 100, centreZ: -75, lift: 0 });
  });
});

describe('hinge continuity during the assembly (paper never cut)', () => {
  type Hinge = { name: string; a: AssemblyPieceId; b: AssemblyPieceId; points: [number, number, number, number][]; from?: number };
  const along = (n: number, f: (t: number) => [number, number, number, number]) => lerp(0, 1, n).map(f);
  const hinges: Hinge[] = [
    // Tube edges C2 / C3 (wall | wall).
    { name: 'FRONT|LEFT', a: 'FRONT_WALL', b: 'LEFT_WALL', points: along(4, (t) => [0, 400 * t, 150, 400 * t]) },
    { name: 'FRONT|RIGHT', a: 'FRONT_WALL', b: 'RIGHT_WALL', points: along(4, (t) => [200, 400 * t, 0, 400 * t]) },
    { name: 'RIGHT|BACK', a: 'RIGHT_WALL', b: 'BACK_WALL', points: along(4, (t) => [150, 400 * t, 0, 400 * t]) },
    { name: 'BACK|GLUE (C3)', a: 'BACK_WALL', b: 'GLUE_WALL', points: along(4, (t) => [200, 390 * t, 0, 390 * t]) },
    // Bottom line C1 (wall | zone).
    { name: 'FRONT C1', a: 'FRONT_WALL', b: 'FRONT_TRAPEZOID', points: along(4, (t) => [200 * t, 0, 200 * t, 0]) },
    { name: 'BACK C1', a: 'BACK_WALL', b: 'BACK_TRAPEZOID', points: along(4, (t) => [200 * t, 0, 200 * t, 0]) },
    { name: 'LEFT C1', a: 'LEFT_WALL', b: 'LEFT_SIDE_FLAP', points: along(4, (t) => [150 * t, 0, 150 * t, 0]) },
    { name: 'RIGHT C1', a: 'RIGHT_WALL', b: 'RIGHT_SIDE_FLAP', points: along(4, (t) => [150 * t, 0, 150 * t, 0]) },
    { name: 'GLUE C1', a: 'GLUE_WALL', b: 'GLUE_BOTTOM', points: along(2, (t) => [s * t, 0, s * t, 0]) },
    // 45° creases C9 (trapezoid | corner triangle).
    { name: 'FRONT C9 left', a: 'FRONT_TRAPEZOID', b: 'FRONT_EAR_LEFT_DIAGONAL', points: along(4, (t) => [E * t, -E * t, E * t, -E * t]) },
    { name: 'FRONT C9 right', a: 'FRONT_TRAPEZOID', b: 'FRONT_EAR_RIGHT_DIAGONAL', points: along(4, (t) => [200 - E * t, -E * t, 200 - E * t, -E * t]) },
    { name: 'BACK C9 right', a: 'BACK_TRAPEZOID', b: 'BACK_EAR_RIGHT_DIAGONAL', points: along(4, (t) => [E * t, -E * t, E * t, -E * t]) },
    { name: 'BACK C9 left', a: 'BACK_TRAPEZOID', b: 'BACK_EAR_LEFT_DIAGONAL', points: along(4, (t) => [200 - E * t, -E * t, 200 - E * t, -E * t]) },
    // Tube corner edges in the zone (corner triangle | side flap): C2 / C3 continued below the bottom line.
    { name: 'FRONT ear|LEFT flap', a: 'FRONT_EAR_LEFT_CORNER', b: 'LEFT_SIDE_FLAP', points: along(4, (t) => [0, -E * t, 150, -E * t]) },
    { name: 'FRONT ear|RIGHT flap', a: 'FRONT_EAR_RIGHT_CORNER', b: 'RIGHT_SIDE_FLAP', points: along(4, (t) => [200, -E * t, 0, -E * t]) },
    { name: 'BACK ear|RIGHT flap', a: 'BACK_EAR_RIGHT_CORNER', b: 'RIGHT_SIDE_FLAP', points: along(4, (t) => [0, -E * t, 150, -E * t]) },
    { name: 'BACK ear|glue flap (C3)', a: 'BACK_EAR_LEFT_CORNER', b: 'GLUE_BOTTOM', points: along(4, (t) => [200, -E * t, 0, -E * t]) },
    // Seam: once the tube is closed, the BACK ear also meets LEFT's side flap (through the glue flap).
    { name: 'BACK ear|LEFT flap (seam)', a: 'BACK_EAR_LEFT_CORNER', b: 'LEFT_SIDE_FLAP', points: along(4, (t) => [200, -E * t, 0, -E * t]), from: 0.4 },
    // Ear bends (corner part | diagonal part).
    { name: 'FRONT left ear bend', a: 'FRONT_EAR_LEFT_CORNER', b: 'FRONT_EAR_LEFT_DIAGONAL', points: along(4, (t) => [bend * t, -E * t, bend * t, -E * t]) },
    { name: 'FRONT right ear bend', a: 'FRONT_EAR_RIGHT_CORNER', b: 'FRONT_EAR_RIGHT_DIAGONAL', points: along(4, (t) => [200 - bend * t, -E * t, 200 - bend * t, -E * t]) },
    { name: 'BACK right ear bend', a: 'BACK_EAR_RIGHT_CORNER', b: 'BACK_EAR_RIGHT_DIAGONAL', points: along(4, (t) => [bend * t, -E * t, bend * t, -E * t]) },
    { name: 'BACK left ear bend', a: 'BACK_EAR_LEFT_CORNER', b: 'BACK_EAR_LEFT_DIAGONAL', points: along(4, (t) => [200 - bend * t, -E * t, 200 - bend * t, -E * t]) },
  ];

  it.each(SAMPLES)('keeps every hinge closed at q = %s', (q) => {
    const pose = getAssemblyPose(dims, q);
    for (const hinge of hinges) {
      if (hinge.from !== undefined && q < hinge.from) continue;
      for (const [ua, va, ub, vb] of hinge.points) {
        const gap = dist(at(pose, hinge.a, ua, va), at(pose, hinge.b, ub, vb));
        expect(gap, `${hinge.name} at q = ${q}`).toBeLessThan(1e-9);
      }
    }
  });

  it.each([
    { width: 200, height: 300, depth: 75 },
    { width: 200, height: 300, depth: 150 },
    { width: 200, height: 300, depth: 40 },
    { width: 120, height: 300, depth: 110 }, // degenerate: W < D + 30
  ])('keeps the zone hinges closed for other sizes (%o)', (d) => {
    const ps = getAssemblyPieces(d);
    const find = (id: AssemblyPieceId) => ps.find((p) => p.id === id)!;
    const e = (d.depth + 30) / 2;
    const m = Math.min(e, d.width / 2);
    for (const q of lerp(0.4, 1, 12)) {
      const pose = getAssemblyPose(d, q);
      for (const t of lerp(0, 1, 4)) {
        const trap = assemblyPoint(pose, find('FRONT_TRAPEZOID'), m * t, -m * t);
        expect(dist(trap, assemblyPoint(pose, find('FRONT_EAR_LEFT_DIAGONAL'), m * t, -m * t))).toBeLessThan(1e-9);
        const flap = assemblyPoint(pose, find('LEFT_SIDE_FLAP'), d.depth, -e * t);
        expect(dist(flap, assemblyPoint(pose, find('FRONT_EAR_LEFT_CORNER'), 0, -e * t))).toBeLessThan(1e-9);
        const seam = assemblyPoint(pose, find('LEFT_SIDE_FLAP'), 0, -e * t);
        expect(dist(seam, assemblyPoint(pose, find('BACK_EAR_LEFT_CORNER'), d.width, -e * t))).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps the glue flap on the back strip of LEFT once the tube is closed (q ≥ 0.4)', () => {
    for (const q of SAMPLES.filter((x) => x >= 0.4)) {
      const pose = getAssemblyPose(dims, q);
      expect(dist(at(pose, 'GLUE_WALL', 5, 200), at(pose, 'LEFT_WALL', 5, 200))).toBeLessThan(1e-9);
      expect(dist(at(pose, 'GLUE_BOTTOM', 8, -30), at(pose, 'LEFT_SIDE_FLAP', 8, -30))).toBeLessThan(1e-9);
    }
    // While the tube forms, the flap swings in with BACK (it only meets LEFT at the end of phase A).
    const mid = getAssemblyPose(dims, 0.2);
    expect(dist(at(mid, 'GLUE_WALL', 5, 200), at(mid, 'LEFT_WALL', 5, 200))).toBeGreaterThan(10);
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
    for (const q of [0.3, 0.45, 0.5, 0.55, 0.63, 0.9]) {
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

  it('turns the corner triangles over their 45° crease, bending OUTWARDS while the sides go in (client [K])', () => {
    // Mid phase B (β = 45°): the tube corner edge lies along the crease; the triangle is folded double on its bend,
    // bulging away from the bag (z > 0 in front of FRONT, z < −D behind BACK) — never into the side flap.
    for (const q of [0.45, 0.5, 0.55]) {
      const pose = getAssemblyPose(dims, q);
      expect(at(pose, 'FRONT_EAR_LEFT_CORNER', bend, -E).z).toBeGreaterThan(1);
      expect(at(pose, 'FRONT_EAR_RIGHT_CORNER', 200 - bend, -E).z).toBeGreaterThan(1);
      expect(at(pose, 'BACK_EAR_RIGHT_CORNER', bend, -E).z).toBeLessThan(-150 - 1);
      expect(at(pose, 'BACK_EAR_LEFT_CORNER', 200 - bend, -E).z).toBeLessThan(-150 - 1);
    }
    // End of phase B: the triangle lies flat on the inside of its (still vertical) trapezoid, turned over its diagonal.
    const sidesIn = getAssemblyPose(dims, 0.6);
    const corner = at(sidesIn, 'FRONT_EAR_LEFT_CORNER', 0, -E);
    expect(corner.x).toBeCloseTo(E, 9); // tube corner edge point at depth E → on the bottom line at x = E
    expect(corner.y).toBeCloseTo(0, 9);
    expect(corner.z).toBeCloseTo(0, 9);
  });
});

describe('bottom layer order through the timeline (client rule [K]: side flaps under both trapezoids)', () => {
  const ys = (pose: AssemblyPose, id: AssemblyPieceId) => byId[id].polygon.map((p) => at(pose, id, p.x, p.y).y);
  const zoneIds = pieces.filter((p) => p.allowance).map((p) => p.id);

  it('keeps every trapezoid and corner triangle at or below the side flaps once the sides are in', () => {
    for (const q of lerp(0.6, 1, 16)) {
      const pose = getAssemblyPose(dims, q);
      for (const id of ['LEFT_SIDE_FLAP', 'RIGHT_SIDE_FLAP'] as const) ys(pose, id).forEach((y) => expect(y).toBeCloseTo(0, 9));
      for (const id of zoneIds.filter((x) => !x.endsWith('SIDE_FLAP') && x !== 'GLUE_BOTTOM')) {
        ys(pose, id).forEach((y) => expect(y, `${id} at q = ${q}`).toBeLessThanOrEqual(1e-9));
      }
    }
  });

  it('keeps both trapezoids vertical while the sides go in, and the BACK trapezoid below the FRONT one after', () => {
    for (const q of lerp(0.4, 0.6, 8)) {
      const pose = getAssemblyPose(dims, q);
      expect(at(pose, 'FRONT_TRAPEZOID', 100, -E).y).toBeCloseTo(-E, 9);
      expect(at(pose, 'BACK_TRAPEZOID', 100, -E).y).toBeCloseTo(-E, 9);
    }
    const tip = (q: number, id: 'FRONT_TRAPEZOID' | 'BACK_TRAPEZOID') => at(getAssemblyPose(dims, q), id, 100, -E).y;
    expect(tip(0.7, 'FRONT_TRAPEZOID')).toBeGreaterThan(tip(0.7, 'BACK_TRAPEZOID') + 10);
    expect(tip(0.9, 'FRONT_TRAPEZOID')).toBeCloseTo(0, 9);
    expect(tip(0.9, 'BACK_TRAPEZOID')).toBeLessThan(-10);
    expect(tip(1, 'BACK_TRAPEZOID')).toBeCloseTo(0, 9);
  });
});
