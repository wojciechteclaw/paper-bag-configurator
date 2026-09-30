import { describe, expect, it } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { getVisibleBottomPieces, pointInConvexPolygon } from '../../src/domain/geometry/blockBottom';
import {
  BOTTOM_INNER_LINE_LIFT_MM,
  BOTTOM_LAYER_OFFSET_MM,
  BOTTOM_LINE_LIFT_MM,
  getBottomLayerOffsetMm,
  MM_TO_SCENE,
  PAPER_LAYER_GAP_MM,
} from '../../src/renderer/constants';
import {
  BAG_PANEL_IDS,
  createBagMeshes,
  createBottomPieceMeshes,
  createInnerBottomMeshes,
  createPanelMesh,
  getBagFrame,
  getCreaseSpecs,
  getEdgeSpecs,
  getInnerBottomEdgeSpecs,
  updatePanelMesh,
  writeLineSegments,
  type BagPanelId,
} from '../../src/renderer/bagGeometry';

const dims = { width: 200, height: 400, depth: 150 };
const s = MM_TO_SCENE;

function posed(id: BagPanelId, foldProgress: number) {
  const mesh = createPanelMesh(id, dims);
  updatePanelMesh(mesh, getBagFrame(dims, foldProgress));
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
  const nrm = mesh.geometry.getAttribute('normal') as BufferAttribute;
  const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
  return { mesh, pos, nrm, uv };
}

const OUTWARD: Record<BagPanelId, Vector3> = {
  FRONT: new Vector3(0, 0, 1),
  BACK: new Vector3(0, 0, -1),
  LEFT: new Vector3(-1, 0, 0),
  RIGHT: new Vector3(1, 0, 0),
  BOTTOM: new Vector3(0, -1, 0),
};

describe('open bag (foldProgress 0)', () => {
  it.each(BAG_PANEL_IDS)('%s lies on the box face with outward normals', (id) => {
    const { pos, nrm } = posed(id, 0);
    const n = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual((dims.width / 2) * s + 1e-6);
      expect(Math.abs(pos.getZ(i))).toBeLessThanOrEqual((dims.depth / 2) * s + 1e-6);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-9);
      expect(pos.getY(i)).toBeLessThanOrEqual(dims.height * s + 1e-6);
      n.fromBufferAttribute(nrm, i);
      expect(n.dot(OUTWARD[id])).toBeCloseTo(1);
    }
  });

  it('has no top face (nothing covers y = height except wall edges)', () => {
    for (const id of BAG_PANEL_IDS) {
      const { nrm } = posed(id, 0);
      for (let i = 0; i < nrm.count; i++) expect(nrm.getY(i)).toBeLessThan(0.5);
    }
  });

  it('maps the side regions onto one continuous UV space covering the visible wall', () => {
    const { mesh, uv } = posed('RIGHT', 0);
    expect(mesh.geometry.groups).toHaveLength(4);
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(mesh.local[i * 2] / dims.depth);
      expect(uv.getY(i)).toBeCloseTo(mesh.local[i * 2 + 1] / dims.height);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits BACK into two rigid regions on the pleat', () => {
    expect(posed('BACK', 0).mesh.geometry.groups).toHaveLength(2);
  });
});

describe('folding', () => {
  it('keeps FRONT planar and the bag centred between FRONT and BACK', () => {
    const frame = getBagFrame(dims, 0.5);
    const { pos } = posed('FRONT', 0.5);
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeCloseTo((frame.pose.gap / 2) * s, 6);
    const back = posed('BACK', 0.5);
    // Upper BACK vertices (y ≥ D/2) sit at −g/2.
    for (let i = 0; i < back.pos.count; i++) {
      if (back.mesh.local[i * 2 + 1] >= dims.depth / 2) expect(back.pos.getZ(i)).toBeCloseTo((-frame.pose.gap / 2) * s, 6);
    }
  });

  it('lays the bottom on the outside of BACK when folded flat', () => {
    const { pos, nrm } = posed('BOTTOM', 1);
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(pos.getY(i)).toBeLessThanOrEqual(dims.depth * s + 1e-6);
      expect(pos.getZ(i)).toBeCloseTo(-6 * PAPER_LAYER_GAP_MM * s, 6);
      expect(nrm.getZ(i)).toBeCloseTo(-1);
    }
  });

  it('tucks the side centre crease in by D/2 when folded flat', () => {
    const { mesh, pos } = posed('RIGHT', 1);
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(mesh.local[i * 2] - dims.depth / 2) < 1e-6 && mesh.local[i * 2 + 1] === dims.height) {
        expect(pos.getX(i)).toBeCloseTo((dims.width / 2 - dims.depth / 2) * s, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps the top edges level at every fold state', () => {
    for (const p of [0, 0.25, 0.6, 1]) {
      const specs = getEdgeSpecs(dims);
      const out = new Float32Array(specs.length * 6);
      writeLineSegments(specs, getBagFrame(dims, p), out);
      specs.forEach((spec, i) => {
        if (spec.from[1] === dims.height && spec.to[1] === dims.height && spec.panel !== 'BOTTOM') {
          expect(out[i * 6 + 1]).toBeCloseTo(dims.height * s, 6);
          expect(out[i * 6 + 4]).toBeCloseTo(dims.height * s, 6);
        }
      });
    }
  });
});

describe('lines', () => {
  it('writes 16 edge and 14 crease segments', () => {
    expect(getEdgeSpecs(dims)).toHaveLength(16);
    expect(getCreaseSpecs(dims)).toHaveLength(14);
  });

  it('draws the pleat y = D/2 on BACK (full width) and on the back half of each side', () => {
    const pleats = getCreaseSpecs(dims).filter((c) => c.panel !== 'BOTTOM' && c.from[1] === 75 && c.to[1] === 75);
    expect(pleats.map((c) => c.panel).sort()).toEqual(['BACK', 'LEFT', 'RIGHT']);
    const back = pleats.find((c) => c.panel === 'BACK')!;
    expect([back.from[0], back.to[0]].sort((a, b) => a - b)).toEqual([0, 200]);
    const left = pleats.find((c) => c.panel === 'LEFT')!;
    expect([left.from[0], left.to[0]].sort((a, b) => a - b)).toEqual([0, 75]);
    expect(left.region).toBe('SIDE_BACK_UPPER');
  });

  it('lifts the bottom underside lines off the surface (below the bottom at p = 0)', () => {
    const specs = getCreaseSpecs(dims).filter((c) => c.panel === 'BOTTOM');
    expect(specs).toHaveLength(5); // the "X" (4 visible trapezoid diagonals) + the BACK trapezoid's end edge (glue seam)
    expect(BOTTOM_LINE_LIFT_MM).toBeGreaterThan(getBottomLayerOffsetMm('BACK_TRAPEZOID')); // above the outermost layer
    const out = new Float32Array(specs.length * 6);
    writeLineSegments(specs, getBagFrame(dims, 0), out);
    for (let i = 0; i < specs.length * 2; i++) expect(out[i * 3 + 1]).toBeLessThan(0);
  });
});

describe('bottom pieces continue the wall UV space (SPEC §4f)', () => {
  const a = 90; // (150 + 30) / 2
  const H = dims.height;

  it('builds the bottom from the BACK trapezoid, the free part of the FRONT trapezoid and the two side triangles', () => {
    const pieces = createBottomPieceMeshes(dims);
    expect(pieces.map((m) => [m.id, m.piece, m.artworkPanel])).toEqual([
      ['BOTTOM', 'BACK_TRAPEZOID', 'BACK'],
      ['BOTTOM', 'FRONT_TRAPEZOID', 'FRONT'],
      ['BOTTOM', 'SIDE_FLAP_LEFT', 'LEFT'],
      ['BOTTOM', 'SIDE_FLAP_RIGHT', 'RIGHT'],
    ]);
    expect(createBagMeshes(dims).map((m) => `${m.face}:${m.piece ?? m.id}`)).toEqual([
      'both:FRONT',
      'both:BACK',
      'both:LEFT',
      'both:RIGHT',
      'outer:BACK_TRAPEZOID',
      'outer:FRONT_TRAPEZOID',
      'outer:SIDE_FLAP_LEFT',
      'outer:SIDE_FLAP_RIGHT',
      'inner:GLUE_FLAP',
      'inner:SIDE_FLAP_LEFT',
      'inner:SIDE_FLAP_RIGHT',
      'inner:FRONT_TRAPEZOID',
      'inner:BACK_TRAPEZOID',
    ]);
    // Client layer rule [K]: side flaps 0, FRONT trapezoid 0.1 mm, BACK 0.2 mm outwards.
    expect(pieces.map((m) => m.lift)).toEqual([0.2, 0.1, 0, 0].map((x) => expect.closeTo(x, 12)));
    // Seen from below at p = 0 the pieces sit 0.2 / 0.1 / 0 mm under the bottom plane.
    const frame = getBagFrame(dims, 0);
    for (const mesh of pieces) {
      updatePanelMesh(mesh, frame);
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) expect(pos.getY(i) / MM_TO_SCENE).toBeCloseTo(-mesh.lift, 4);
    }
  });

  it('maps the side triangle into the side wall UV space (LEFT (x, y) ↔ LEFT-local (y, −x))', () => {
    const left = createBottomPieceMeshes(dims).find((m) => m.piece === 'SIDE_FLAP_LEFT')!;
    const uv = left.geometry.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const [bx, by] = [left.local[i * 2], left.local[i * 2 + 1]];
      expect(uv.getX(i)).toBeCloseTo(by / dims.depth);
      expect(uv.getY(i)).toBeCloseTo(-bx / H);
    }
  });

  it('maps flap vertices into the source wall UV space with v < 0 (bottom-local → wall-local)', () => {
    const [back, front] = createBottomPieceMeshes(dims);
    const uvOf = (mesh: ReturnType<typeof createBottomPieceMeshes>[number]) => mesh.geometry.getAttribute('uv') as BufferAttribute;
    const fuv = uvOf(front);
    for (let i = 0; i < fuv.count; i++) {
      const [bx, by] = [front.local[i * 2], front.local[i * 2 + 1]];
      expect(fuv.getX(i)).toBeCloseTo(bx / dims.width);
      expect(fuv.getY(i)).toBeCloseTo((by - dims.depth) / H);
      expect(fuv.getY(i)).toBeGreaterThanOrEqual(-a / H - 1e-6);
      expect(fuv.getY(i)).toBeLessThanOrEqual(1e-6);
    }
    const buv = uvOf(back);
    for (let i = 0; i < buv.count; i++) {
      const [bx, by] = [back.local[i * 2], back.local[i * 2 + 1]];
      expect(buv.getX(i)).toBeCloseTo((dims.width - bx) / dims.width);
      expect(buv.getY(i)).toBeCloseTo(-by / H);
    }
  });

  it.each([0, 0.25, 0.6, 1])('meets the wall at the bottom crease with the same position and UV (p = %s)', (p) => {
    const frame = getBagFrame(dims, p);
    const meshes = createBagMeshes(dims);
    meshes.forEach((m) => updatePanelMesh(m, frame));
    const at = (mesh: (typeof meshes)[number], u: number, v: number) => {
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6) {
          return new Vector3().fromBufferAttribute(pos, i);
        }
      }
      return null;
    };
    const byPiece = Object.fromEntries(meshes.filter((m) => m.face !== 'inner').map((m) => [m.piece ?? m.id, m]));
    // FRONT bottom-left corner (u = 0, v = 0) is also a corner of the FRONT trapezoid; BACK likewise.
    for (const [wall, flap] of [
      ['FRONT', 'FRONT_TRAPEZOID'],
      ['BACK', 'BACK_TRAPEZOID'],
    ] as const) {
      for (const u of [0, 1]) {
        const onWall = at(byPiece[wall], u, 0);
        const onFlap = at(byPiece[flap], u, 0);
        expect(onWall).not.toBeNull();
        expect(onFlap).not.toBeNull();
        const lift = byPiece[flap].lift * s; // client layer offset of the trapezoid (render-only)
        expect(onFlap!.distanceTo(onWall!)).toBeLessThan(1e-6 + lift + (p === 1 ? 7 * PAPER_LAYER_GAP_MM * s : 0));
      }
    }
  });
});

describe('bottom seen from inside (open top)', () => {
  const triangleArea = (pos: BufferAttribute, i: number) => {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, i + k));
    return b.sub(a).cross(c.sub(a)).length() / 2;
  };

  it('tiles the inside of the bottom with the stack layers, inner face only, at their layer offsets', () => {
    const inner = createInnerBottomMeshes(dims);
    expect(inner.map((m) => m.piece)).toEqual(['GLUE_FLAP', 'SIDE_FLAP_LEFT', 'SIDE_FLAP_RIGHT', 'FRONT_TRAPEZOID', 'BACK_TRAPEZOID']);
    inner.forEach((m) => expect(m.face).toBe('inner'));
    expect(inner.map((m) => m.lift)).toEqual([-0.05, 0, 0, 0.1, 0.2].map((x) => expect.closeTo(x, 12)));
    const frame = getBagFrame(dims, 0);
    let area = 0;
    for (const mesh of inner) {
      updatePanelMesh(mesh, frame);
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      const nrm = mesh.geometry.getAttribute('normal') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        expect(pos.getY(i) / MM_TO_SCENE).toBeCloseTo(-mesh.lift, 4);
        expect(nrm.getY(i)).toBeCloseTo(-1); // front face points out of the bag → rendered BackSide from inside
      }
      for (let i = 0; i < pos.count; i += 3) area += triangleArea(pos, i);
    }
    expect(area / (s * s)).toBeCloseTo(dims.width * dims.depth, 1);
  });

  it('draws the inner paper edges just inside their face and behind the outer layers from below', () => {
    const specs = getInnerBottomEdgeSpecs(dims);
    expect(specs).toHaveLength(5); // two side flap edges, the FRONT trapezoid end, the glue flap edge + chamfer
    const outer = getVisibleBottomPieces(dims);
    for (const spec of specs) {
      expect(spec.panel).toBe('BOTTOM');
      expect(spec.lift).toBeLessThan(0.1);
      // From below the line is covered by the outer-visible piece there, which sits further out.
      const mid = { x: (spec.from[0] + spec.to[0]) / 2, y: (spec.from[1] + spec.to[1]) / 2 };
      const cover = outer.find((piece) => piece.visibleParts.some((part) => pointInConvexPolygon(mid, part, 1e-6)))!;
      expect(getBottomLayerOffsetMm(cover.id) - (spec.lift ?? 0)).toBeGreaterThanOrEqual(BOTTOM_LAYER_OFFSET_MM - 1e-9);
    }
    for (const p of [0, 0.25, 1]) {
      const frame = getBagFrame(dims, p);
      const inward = new Vector3(0, Math.cos(frame.pose.phi), Math.sin(frame.pose.phi));
      const onFace = specs.map((spec) => ({ ...spec, lift: spec.lift! + BOTTOM_INNER_LINE_LIFT_MM }));
      const [line, face] = [specs, onFace].map((list) => {
        const out = new Float32Array(list.length * 6);
        writeLineSegments(list, frame, out);
        return out;
      });
      for (let i = 0; i < specs.length * 2; i++) {
        const d = new Vector3(line[i * 3] - face[i * 3], line[i * 3 + 1] - face[i * 3 + 1], line[i * 3 + 2] - face[i * 3 + 2]);
        expect(d.dot(inward) / s).toBeCloseTo(BOTTOM_INNER_LINE_LIFT_MM, 4); // on the inner side of its face (float32)
      }
    }
  });
});
