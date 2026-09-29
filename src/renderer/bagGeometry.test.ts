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
      expect(pos.getY(i)).toBeGreaterThanOrEqual(0);
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

  it('maps the side panel regions L, R, T onto one continuous UV space', () => {
    const { mesh, uv } = posed('RIGHT', 0);
    expect(mesh.geometry.groups).toHaveLength(3);
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(mesh.local[i * 2] / dims.depth);
      expect(uv.getY(i)).toBeCloseTo(mesh.local[i * 2 + 1] / dims.height);
    }
  });
});

describe('folding', () => {
  it('moves the walls together by D·cos θ and keeps them planar', () => {
    const { pos } = posed('FRONT', 0.5);
    const expected = ((dims.depth * Math.SQRT1_2) / 2 + 3 * PAPER_LAYER_GAP_MM * Math.SQRT1_2) * s;
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeCloseTo(expected, 6);
  });

  it('tucks the centre crease in by D/2 when folded flat', () => {
    const { mesh, pos } = posed('RIGHT', 1);
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(mesh.local[i * 2] - dims.depth / 2) < 1e-6 && mesh.local[i * 2 + 1] === dims.height) {
        expect(pos.getX(i)).toBeCloseTo((dims.width / 2 - dims.depth / 2) * s, 6);
      }
    }
  });

  it('keeps the side hinges on the wall edges and the layers apart at 100 %', () => {
    const frame = getBagFrame(dims, 1);
    const edges = getEdgeSpecs(dims);
    const out = new Float32Array(edges.length * 6);
    writeLineSegments(edges, frame, out);
    expect(frame.wallOffset).toBeCloseTo(3 * PAPER_LAYER_GAP_MM);
    // RIGHT top rim, L half: starts at the front wall edge.
    const i = edges.findIndex((e) => e.panel === 'RIGHT');
    expect(out[i * 6]).toBeCloseTo((dims.width / 2) * s);
    expect(out[i * 6 + 2]).toBeCloseTo(frame.wallOffset * s);
  });

  it('writes 14 edge and 6 crease segments', () => {
    expect(getEdgeSpecs(dims)).toHaveLength(14);
    expect(getCreaseSpecs(dims)).toHaveLength(6);
  });
});
