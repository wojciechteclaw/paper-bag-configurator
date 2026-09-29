import { describe, expect, it } from 'vitest';
import { getPanelRegions, type FoldPanelId, type FoldRegionId } from './blockBottom';
import {
  foldPoint,
  getFoldAngles,
  getFoldHinges,
  getFoldPose,
  getSideTriangleTilt,
  getStandingFoldProgress,
  STANDING_TRIANGLE_TILT,
  type FoldPose,
  type Vec3,
} from './foldKinematics';

const dims = { width: 200, height: 400, depth: 150 };
const deg = (r: number) => (r * 180) / Math.PI;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const PANELS: FoldPanelId[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'BOTTOM'];
const SAMPLES = [0, 0.1, 0.25, 0.3, 0.5, 0.75, 0.9, 1];

const place = (pose: FoldPose, panel: FoldPanelId, region: FoldRegionId, u: number, v: number) =>
  foldPoint(pose, panel, region, u, v, { x: 0, y: 0, z: 0 });

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Outward normal of a folded region (from its first three polygon vertices). */
function regionNormal(pose: FoldPose, panel: FoldPanelId, region: FoldRegionId): Vec3 {
  const poly = getPanelRegions(panel, dims).find((r) => r.id === region)!.polygon;
  const [a, b, c] = poly.map((p) => place(pose, panel, region, p.x, p.y));
  return norm(cross(sub(b, a), sub(c, a)));
}

describe('fold angles (docs/PRODUCTION.md §10.5 table)', () => {
  it.each([
    [0, 0, 0, 0, 1],
    [0.25, 45, 8.4, 50.5, 0.636],
    [0.5, 90, 30, 68.5, 0.366],
    [0.75, 135, 58.6, 80.4, 0.167],
    [1, 180, 90, 90, 0],
  ])('p = %s', (p, psi, phi, theta, ratio) => {
    const a = getFoldAngles(p);
    expect(deg(a.psi)).toBeCloseTo(psi, 1);
    expect(deg(a.phi)).toBeCloseTo(phi, 0);
    expect(Math.abs(deg(a.theta) - theta)).toBeLessThan(0.1);
    expect(Math.abs(a.frontBackRatio - ratio)).toBeLessThan(0.001);
  });

  it('clamps p and treats NaN as 0', () => {
    expect(getFoldAngles(-1)).toEqual(getFoldAngles(0));
    expect(getFoldAngles(2)).toEqual(getFoldAngles(1));
    expect(getFoldAngles(Number.NaN)).toEqual(getFoldAngles(0));
  });

  it('keeps g/D = cos θ and the BACK_LOWER strip closed onto the bottom back edge', () => {
    for (const p of SAMPLES) {
      const pose = getFoldPose(dims, p);
      expect(pose.gap).toBeCloseTo(dims.depth * Math.cos(pose.theta), 9);
      // BACK_LOWER bottom edge (y = 0) coincides with the bottom's back edge (BOTTOM y = 0).
      for (const x of [0, 50, 200]) {
        const back = place(pose, 'BACK', 'BACK_LOWER', dims.width - x, 0);
        const bottom = place(pose, 'BOTTOM', 'BOTTOM', x, 0);
        expect(dist(back, bottom)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('fold poses', () => {
  it('is the open box at p = 0 with outward normals', () => {
    const pose = getFoldPose(dims, 0);
    const outward: Record<FoldPanelId, Vec3> = {
      FRONT: { x: 0, y: 0, z: 1 },
      BACK: { x: 0, y: 0, z: -1 },
      LEFT: { x: -1, y: 0, z: 0 },
      RIGHT: { x: 1, y: 0, z: 0 },
      BOTTOM: { x: 0, y: -1, z: 0 },
    };
    for (const panel of PANELS) {
      for (const r of getPanelRegions(panel, dims)) {
        expect(dot(regionNormal(pose, panel, r.id), outward[panel])).toBeCloseTo(1, 9);
        for (const p of r.polygon) {
          const w = place(pose, panel, r.id, p.x, p.y);
          expect(w.x).toBeGreaterThanOrEqual(-1e-9);
          expect(w.x).toBeLessThanOrEqual(dims.width + 1e-9);
          expect(w.z).toBeLessThanOrEqual(1e-9);
          expect(w.z).toBeGreaterThanOrEqual(-dims.depth - 1e-9);
        }
      }
    }
    // Bottom corners.
    expect(place(pose, 'BOTTOM', 'BOTTOM', 0, 0)).toEqual({ x: 0, y: 0, z: -150 });
    expect(place(pose, 'BOTTOM', 'BOTTOM', 200, 150)).toEqual({ x: 200, y: 0, z: -0 });
  });

  it('matches docs/PRODUCTION.md §3.5 when folded flat (p = 1)', () => {
    const pose = getFoldPose(dims, 1);
    const { F0, B0, K, A } = pose.controls;
    expect(dist(F0, { x: 0, y: 0, z: 0 })).toBeLessThan(1e-9);
    expect(dist(B0, { x: 0, y: 150, z: 0 })).toBeLessThan(1e-9);
    expect(dist(K, { x: 0, y: 75, z: 0 })).toBeLessThan(1e-9);
    expect(dist(A, { x: 75, y: 75, z: 0 })).toBeLessThan(1e-9);
    for (const panel of PANELS) {
      for (const r of getPanelRegions(panel, dims)) {
        for (const p of r.polygon) expect(Math.abs(place(pose, panel, r.id, p.x, p.y).z)).toBeLessThan(1e-9);
      }
    }
    // Bottom lies on BACK, y ∈ [0, D], hinged on the front crease; top edges stay level at H.
    expect(place(pose, 'BOTTOM', 'BOTTOM', 10, 0).y).toBeCloseTo(150);
    expect(place(pose, 'BOTTOM', 'BOTTOM', 10, 150).y).toBeCloseTo(0);
    expect(place(pose, 'BACK', 'BACK_UPPER', 10, 400).y).toBe(400);
    // BACK_LOWER is Z-folded up: its bottom edge ends at y = D.
    expect(place(pose, 'BACK', 'BACK_LOWER', 10, 0).y).toBeCloseTo(150);
    // Bottom and BACK face away from the viewer (bottom's outside faces −z after the flip).
    expect(regionNormal(pose, 'BOTTOM', 'BOTTOM').z).toBeCloseTo(-1);
    expect(regionNormal(pose, 'FRONT', 'FRONT').z).toBeCloseTo(1);
  });

  it('keeps neighbouring regions attached along every crease (no gaps)', () => {
    const checks: [FoldPanelId, FoldRegionId, FoldRegionId, number, number][] = [];
    const h = dims.depth / 2;
    for (const side of ['LEFT', 'RIGHT'] as const) {
      const m = (u: number) => (side === 'LEFT' ? u : dims.depth - u); // LEFT-local u → panel u
      checks.push(
        [side, 'SIDE_FRONT', 'SIDE_BACK_UPPER', m(h), 300],
        [side, 'SIDE_FRONT', 'SIDE_BACK_UPPER', m(h), h],
        [side, 'SIDE_FRONT', 'SIDE_T', m(dims.depth - 30), 30],
        [side, 'SIDE_T', 'SIDE_BACK_LOWER', m(40), 40],
        [side, 'SIDE_BACK_UPPER', 'SIDE_BACK_LOWER', m(20), h],
      );
    }
    for (const p of SAMPLES) {
      const pose = getFoldPose(dims, p);
      for (const [panel, a, b, u, v] of checks) {
        expect(dist(place(pose, panel, a, u, v), place(pose, panel, b, u, v))).toBeLessThan(1e-9);
      }
      expect(dist(place(pose, 'BACK', 'BACK_UPPER', 30, h), place(pose, 'BACK', 'BACK_LOWER', 30, h))).toBeLessThan(
        1e-9,
      );
      // Side hinges on the wall edges: LEFT u = D on FRONT x = 0, LEFT u = 0 on BACK x = W (BACK-local).
      for (const v of [h, 250, 400]) {
        expect(dist(place(pose, 'LEFT', 'SIDE_FRONT', dims.depth, v), place(pose, 'FRONT', 'FRONT', 0, v))).toBeLessThan(
          1e-9,
        );
        expect(dist(place(pose, 'RIGHT', 'SIDE_FRONT', 0, v), place(pose, 'FRONT', 'FRONT', 200, v))).toBeLessThan(1e-9);
        expect(
          dist(place(pose, 'LEFT', 'SIDE_BACK_UPPER', 0, v), place(pose, 'BACK', 'BACK_UPPER', 200, v)),
        ).toBeLessThan(1e-9);
      }
      // Side triangle base = bottom short edge; SIDE_BACK_LOWER back edge = BACK_LOWER edge.
      expect(dist(place(pose, 'LEFT', 'SIDE_T', 0, 0), place(pose, 'BOTTOM', 'BOTTOM', 0, 0))).toBeLessThan(1e-9);
      expect(dist(place(pose, 'LEFT', 'SIDE_T', 150, 0), place(pose, 'BOTTOM', 'BOTTOM', 0, 150))).toBeLessThan(1e-9);
      expect(dist(place(pose, 'RIGHT', 'SIDE_T', 150, 0), place(pose, 'BOTTOM', 'BOTTOM', 200, 0))).toBeLessThan(1e-9);
      expect(
        dist(place(pose, 'LEFT', 'SIDE_BACK_LOWER', 0, 30), place(pose, 'BACK', 'BACK_LOWER', 200, 30)),
      ).toBeLessThan(1e-9);
    }
  });

  it('moves the large panels rigidly (distances inside a region are preserved)', () => {
    const rigid: [FoldPanelId, FoldRegionId, [number, number], [number, number]][] = [
      ['BOTTOM', 'BOTTOM', [0, 0], [200, 150]],
      ['BACK', 'BACK_LOWER', [0, 0], [200, 75]],
      ['LEFT', 'SIDE_FRONT', [150, 0], [75, 400]],
      ['LEFT', 'SIDE_BACK_UPPER', [0, 75], [75, 400]],
      ['RIGHT', 'SIDE_FRONT', [0, 0], [75, 400]],
    ];
    for (const p of SAMPLES) {
      const pose = getFoldPose(dims, p);
      const flat = getFoldPose(dims, 0);
      for (const [panel, region, a, b] of rigid) {
        const d0 = dist(place(flat, panel, region, ...a), place(flat, panel, region, ...b));
        const d1 = dist(place(pose, panel, region, ...a), place(pose, panel, region, ...b));
        expect(d1).toBeCloseTo(d0, 9);
      }
    }
  });

  it('only stretches the back 45° crease B0–A, by at most ~21 % (docs/PRODUCTION.md §10.5)', () => {
    const h = dims.depth / 2;
    let maxStretch = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const { F0, B0, K, A } = getFoldPose(dims, p).controls;
      expect(dist(F0, B0)).toBeCloseTo(dims.depth, 9);
      expect(dist(F0, A)).toBeCloseTo(h * Math.SQRT2, 9);
      expect(dist(B0, K)).toBeCloseTo(h, 9);
      expect(dist(K, A)).toBeCloseTo(h, 9);
      maxStretch = Math.max(maxStretch, dist(B0, A) / (h * Math.SQRT2) - 1);
    }
    expect(maxStretch).toBeGreaterThan(0.15);
    expect(maxStretch).toBeLessThan(0.25);
    const end = getFoldPose(dims, 1).controls;
    expect(dist(end.B0, end.A)).toBeCloseTo(h * Math.SQRT2, 9);
  });
});

describe('hinges', () => {
  it('report the dihedral angles of docs/PRODUCTION.md §10.6 at both ends', () => {
    const at = (p: number) =>
      Object.fromEntries(getFoldHinges(getFoldPose(dims, p)).map((h) => [`${h.regions.join('|')}|${h.side ?? ''}`, deg(h.dihedral)]));
    const open = at(0);
    const flat = at(1);
    expect(open['FRONT|BOTTOM|']).toBeCloseTo(90);
    expect(open['BACK_UPPER|BACK_LOWER|']).toBeCloseTo(180);
    expect(open['BACK_LOWER|BOTTOM|']).toBeCloseTo(90);
    expect(open['FRONT|SIDE_FRONT|LEFT']).toBeCloseTo(90);
    expect(open['SIDE_FRONT|SIDE_BACK_UPPER|RIGHT']).toBeCloseTo(180);
    Object.values(flat).forEach((a) => expect(a).toBeCloseTo(0));
  });

  it('agree with the folded region normals', () => {
    for (const p of [0.2, 0.5, 0.8]) {
      const pose = getFoldPose(dims, p);
      for (const hinge of getFoldHinges(pose)) {
        const panelOf = (r: FoldRegionId): FoldPanelId =>
          r === 'FRONT' ? 'FRONT' : r === 'BOTTOM' ? 'BOTTOM' : r.startsWith('BACK') ? 'BACK' : hinge.side!;
        const [a, b] = hinge.regions;
        const na = regionNormal(pose, panelOf(a), a);
        const nb = regionNormal(pose, panelOf(b), b);
        // Outward normals of two panels meeting at interior angle α enclose π − α.
        expect(Math.acos(Math.max(-1, Math.min(1, dot(na, nb))))).toBeCloseTo(Math.PI - hinge.dihedral, 6);
      }
    }
  });
});

describe('standing preset', () => {
  it('tilts the side triangle from 0 (open) to 90° (flat)', () => {
    expect(getSideTriangleTilt(getFoldPose(dims, 0))).toBeCloseTo(0);
    expect(deg(getSideTriangleTilt(getFoldPose(dims, 1)))).toBeCloseTo(90);
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const tilt = getSideTriangleTilt(getFoldPose(dims, p));
      expect(tilt).toBeGreaterThan(prev);
      prev = tilt;
    }
  });

  it('finds p ≈ 0.25 for a 45° triangle, independent of the dimensions', () => {
    const p = getStandingFoldProgress();
    expect(p).toBeGreaterThan(0.24);
    expect(p).toBeLessThan(0.26);
    for (const d of [dims, { width: 75, height: 170, depth: 40 }, { width: 260, height: 430, depth: 260 }]) {
      expect(getSideTriangleTilt(getFoldPose(d, p))).toBeCloseTo(STANDING_TRIANGLE_TILT, 6);
    }
  });
});

describe('fold direction of the wall creases (cross-check of the dieline valley / mountain classification)', () => {
  // Seen from the print (outer) side: MOUNTAIN = the neighbouring region bends towards the print side (print side
  // inside the fold), VALLEY = it bends away (print side outside). Client convention, docs/PRODUCTION.md §9.3.
  const centroid = (pose: FoldPose, panel: FoldPanelId, region: FoldRegionId) => {
    const poly = getPanelRegions(panel, dims).find((r) => r.id === region)!.polygon;
    const pts = poly.map((p) => place(pose, panel, region, p.x, p.y));
    const n = pts.length;
    return pts.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n, z: s.z + p.z / n }), { x: 0, y: 0, z: 0 });
  };
  const sense = (
    p: number,
    a: [FoldPanelId, FoldRegionId],
    b: [FoldPanelId, FoldRegionId],
    hinge: [number, number],
  ): 'MOUNTAIN' | 'VALLEY' => {
    const pose = getFoldPose(dims, p);
    const on = place(pose, a[0], a[1], hinge[0], hinge[1]);
    const side = dot(sub(centroid(pose, b[0], b[1]), on), regionNormal(pose, a[0], a[1]));
    return side > 0 ? 'MOUNTAIN' : 'VALLEY';
  };

  it.each([0.3, 0.5, 0.8])('matches the client classification and the C8 split at p = %s', (p) => {
    // C4 gusset centre axis (LEFT, u = D/2): MOUNTAIN.
    expect(sense(p, ['LEFT', 'SIDE_BACK_UPPER'], ['LEFT', 'SIDE_FRONT'], [75, 300])).toBe('MOUNTAIN');
    // C6 45° diagonals: MOUNTAIN on both sides of the triangle.
    expect(sense(p, ['LEFT', 'SIDE_FRONT'], ['LEFT', 'SIDE_T'], [112.5, 37.5])).toBe('MOUNTAIN');
    expect(sense(p, ['LEFT', 'SIDE_BACK_LOWER'], ['LEFT', 'SIDE_T'], [37.5, 37.5])).toBe('MOUNTAIN');
    // C8 pleat: VALLEY on the side's back half, MOUNTAIN on BACK.
    expect(sense(p, ['LEFT', 'SIDE_BACK_UPPER'], ['LEFT', 'SIDE_BACK_LOWER'], [37.5, 75])).toBe('VALLEY');
    expect(sense(p, ['BACK', 'BACK_UPPER'], ['BACK', 'BACK_LOWER'], [100, 75])).toBe('MOUNTAIN');
    // C2 tube edge and C1 bottom line: VALLEY.
    expect(sense(p, ['FRONT', 'FRONT'], ['LEFT', 'SIDE_FRONT'], [0, 300])).toBe('VALLEY');
    expect(sense(p, ['FRONT', 'FRONT'], ['BOTTOM', 'BOTTOM'], [100, 0])).toBe('VALLEY');
  });
});
