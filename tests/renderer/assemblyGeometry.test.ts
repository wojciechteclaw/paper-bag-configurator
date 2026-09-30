import { BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildDieline } from '../../src/domain/dieline';
import { getAssemblyPieces } from '../../src/domain/geometry/assemblyKinematics';
import {
  createAssemblyMeshes,
  getAssemblyFrame,
  getAssemblyHandleMatrix,
  getAssemblyInwardOffsetMm,
  getAssemblyLineSpecs,
  getSheetViewExtent,
  updateAssemblyMesh,
  writeAssemblyLines,
} from '../../src/renderer/assemblyGeometry';
import { getBagFrame, getWallPlaneZ } from '../../src/renderer/bagGeometry';
import { BOTTOM_LAYER_OFFSET_MM, getBottomLayerOffsetMm, MM_TO_SCENE } from '../../src/renderer/constants';

const dims = { width: 200, height: 400, depth: 150 };
const length = (s: { from: [number, number]; to: [number, number] }) => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

describe('assembly meshes (sheet → bag)', () => {
  it('builds one mesh per sheet piece, walls and allowance in the wall UV space, glue flap unprinted', () => {
    const meshes = createAssemblyMeshes(dims);
    expect(meshes.map((m) => m.piece.id)).toEqual(getAssemblyPieces(dims).map((p) => p.id));
    const front = meshes.find((m) => m.piece.id === 'FRONT_TRAPEZOID')!;
    const uv = front.geometry.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(front.local[i * 2] / 200);
      expect(uv.getY(i)).toBeCloseTo(front.local[i * 2 + 1] / 400); // v < 0 below the bottom line
    }
    expect(meshes.find((m) => m.piece.id === 'GLUE_WALL')!.artworkPanel).toBeNull();
    expect(meshes.find((m) => m.piece.id === 'LEFT_SIDE_FLAP')!.artworkPanel).toBe('LEFT');
    expect(meshes.find((m) => m.piece.id === 'FRONT_EAR_LEFT_CORNER')!.artworkPanel).toBe('FRONT');
  });

  it('lays the flat sheet in one plane, centred, standing on the floor', () => {
    const frame = getAssemblyFrame(dims, 0);
    const meshes = createAssemblyMeshes(dims);
    let minY = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const mesh of meshes) {
      updateAssemblyMesh(mesh, frame);
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        expect(pos.getZ(i)).toBeCloseTo(0, 6);
        minY = Math.min(minY, pos.getY(i));
        minX = Math.min(minX, pos.getX(i));
        maxX = Math.max(maxX, pos.getX(i));
      }
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(minX).toBeCloseTo(-355 * MM_TO_SCENE, 6); // 710 mm sheet centred (float32 buffers)
    expect(maxX).toBeCloseTo(355 * MM_TO_SCENE, 6);
    expect(getSheetViewExtent(dims)).toEqual({ radius: 0.5 * Math.hypot(710, 490), centreY: 245 });
  });

  it('attaches every cut and crease line of the dieline to a piece (nothing lost when splitting)', () => {
    const dieline = buildDieline({ dimensions: dims, handle: null });
    const lines = getAssemblyLineSpecs(dims);
    const cutLength = dieline.cuts[0].reduce((sum, p, i, poly) => {
      const q = poly[(i + 1) % poly.length];
      return sum + Math.hypot(q.x - p.x, q.y - p.y);
    }, 0);
    const creaseLength = dieline.creases.reduce((sum, l) => sum + Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y), 0);
    expect(lines.cut.reduce((sum, s) => sum + length(s), 0)).toBeCloseTo(cutLength, 6);
    expect(lines.crease.reduce((sum, s) => sum + length(s), 0)).toBeCloseTo(creaseLength, 6);
    // The chamfered glue-flap ends are carried by the glue pieces.
    expect(lines.cut.some((s) => s.piece.id === 'GLUE_BOTTOM' && s.from[0] !== s.to[0] && s.from[1] !== s.to[1])).toBe(true);
    // The trapezoid diagonals C9 ride on the trapezoids (visible from below once folded), none on the side flaps.
    const c9 = lines.crease.filter((s) => s.from[0] !== s.to[0] && s.from[1] !== s.to[1] && Math.min(s.from[1], s.to[1]) < 0);
    expect(new Set(c9.map((s) => s.piece.id))).toEqual(new Set(['FRONT_TRAPEZOID', 'BACK_TRAPEZOID']));
    const out = new Float32Array(lines.crease.length * 6);
    writeAssemblyLines(lines.crease, getAssemblyFrame(dims, 0.5), out);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it('meets the fold model at the formed bag: handles on FRONT / BACK exactly like the BOX pose', () => {
    const assembly = getAssemblyFrame(dims, 1);
    const box = getBagFrame(dims, 0);
    for (const wall of ['FRONT', 'BACK'] as const) {
      const m = new Matrix4().set(...(getAssemblyHandleMatrix(assembly, wall) as Parameters<Matrix4['set']>));
      const position = new Vector3();
      const quaternion = new Quaternion();
      m.decompose(position, quaternion, new Vector3());
      expect(position.x).toBeCloseTo(0, 9);
      expect(position.y).toBeCloseTo(0, 9);
      expect(position.z).toBeCloseTo(getWallPlaneZ(box, wall), 9);
      const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wall === 'FRONT' ? Math.PI : 0);
      expect(Math.abs(quaternion.dot(expected))).toBeCloseTo(1, 9);
    }
  });

  it('offsets the bottom layers outwards from the side flaps: FRONT −0.1 mm, BACK −0.2 mm (client rule [K])', () => {
    expect(BOTTOM_LAYER_OFFSET_MM).toBe(0.1);
    expect(getBottomLayerOffsetMm('SIDE_FLAP_LEFT')).toBe(0);
    expect(getBottomLayerOffsetMm('FRONT_TRAPEZOID')).toBeCloseTo(0.1, 12);
    expect(getBottomLayerOffsetMm('BACK_TRAPEZOID')).toBeCloseTo(0.2, 12);
    const meshes = createAssemblyMeshes(dims);
    const byId = Object.fromEntries(meshes.map((m) => [m.piece.id, m]));
    expect(getAssemblyInwardOffsetMm(byId.FRONT_TRAPEZOID.piece)).toBeCloseTo(-0.1, 12);
    expect(getAssemblyInwardOffsetMm(byId.BACK_TRAPEZOID.piece)).toBeCloseTo(-0.2, 12);
    expect(getAssemblyInwardOffsetMm(byId.LEFT_SIDE_FLAP.piece)).toBeCloseTo(0, 12);

    // Height (scene y, mm) of a piece's centroid-ish sample in the formed bag: side flaps on top (inside), then the
    // FRONT ears, the FRONT trapezoid, the BACK ears and the BACK trapezoid outermost (lowest).
    const heightOf = (id: string, q: number) => {
      const mesh = byId[id];
      updateAssemblyMesh(mesh, getAssemblyFrame(dims, q));
      const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += pos.getY(i);
      return sum / pos.count / MM_TO_SCENE;
    };
    const order = ['LEFT_SIDE_FLAP', 'FRONT_EAR_LEFT_DIAGONAL', 'FRONT_TRAPEZOID', 'BACK_EAR_LEFT_DIAGONAL', 'BACK_TRAPEZOID'];
    const formed = order.map((id) => heightOf(id, 1));
    expect(formed[0]).toBeCloseTo(0, 4);
    expect(formed[2]).toBeCloseTo(-0.1, 4);
    expect(formed[4]).toBeCloseTo(-0.2, 4);
    for (let i = 1; i < formed.length; i++) expect(formed[i]).toBeLessThan(formed[i - 1]);
    // Through the bottom phases no trapezoid vertex ever rises above the side flaps (which lie flat from q = 0.6 on).
    for (const q of [0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 0.95, 1]) {
      const frame = getAssemblyFrame(dims, q);
      const top = (id: string) => {
        updateAssemblyMesh(byId[id], frame);
        const pos = byId[id].geometry.getAttribute('position') as BufferAttribute;
        let max = -Infinity;
        for (let i = 0; i < pos.count; i++) max = Math.max(max, pos.getY(i));
        return max;
      };
      const flap = heightOf('LEFT_SIDE_FLAP', q);
      for (const id of ['FRONT_TRAPEZOID', 'BACK_TRAPEZOID', 'FRONT_EAR_LEFT_CORNER', 'BACK_EAR_LEFT_CORNER']) {
        expect(top(id) / MM_TO_SCENE, `${id} at q = ${q}`).toBeLessThanOrEqual(flap + 1e-4);
      }
    }
    // The flat sheet stays exactly flat (offsets faded out).
    expect(heightOf('BACK_TRAPEZOID', 0)).toBeGreaterThan(-90 - 1e-4);
    const flat = byId.BACK_TRAPEZOID.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < flat.count; i++) expect(flat.getZ(i)).toBeCloseTo(0, 9);
  });
});
