import { describe, expect, it } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { MM_TO_SCENE, PAPER_LAYER_GAP_MM } from './constants';
import {
  BAG_PANEL_IDS,
  createPanelMesh,
  getBagFrame,
  getCreaseSpecs,
  getEdgeSpecs,
  updatePanelMesh,
  writeLineSegments,
  type BagPanelId,
} from './bagGeometry';

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
  it('writes 16 edge and 17 crease segments', () => {
    expect(getEdgeSpecs(dims)).toHaveLength(16);
    expect(getCreaseSpecs(dims)).toHaveLength(17);
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
    expect(specs).toHaveLength(8);
    const out = new Float32Array(specs.length * 6);
    writeLineSegments(specs, getBagFrame(dims, 0), out);
    for (let i = 0; i < specs.length * 2; i++) expect(out[i * 3 + 1]).toBeLessThan(0);
  });
});
