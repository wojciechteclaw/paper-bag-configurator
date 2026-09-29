import { BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildDieline } from '../domain/dieline';
import { getAssemblyPieces } from '../domain/geometry/assemblyKinematics';
import {
  createAssemblyMeshes,
  getAssemblyFrame,
  getAssemblyHandleMatrix,
  getAssemblyLineSpecs,
  getSheetViewExtent,
  updateAssemblyMesh,
  writeAssemblyLines,
} from './assemblyGeometry';
import { getBagFrame, getWallPlaneZ } from './bagGeometry';
import { MM_TO_SCENE } from './constants';

const dims = { width: 200, height: 400, depth: 150 };
const length = (s: { from: [number, number]; to: [number, number] }) => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

describe('assembly meshes (sheet → bag)', () => {
  it('builds one mesh per sheet piece, walls and allowance in the wall UV space, glue flap unprinted', () => {
    const meshes = createAssemblyMeshes(dims);
    expect(meshes.map((m) => m.piece.id)).toEqual(getAssemblyPieces(dims).map((p) => p.id));
    const front = meshes.find((m) => m.piece.id === 'FRONT_FLAP')!;
    const uv = front.geometry.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(front.local[i * 2] / 200);
      expect(uv.getY(i)).toBeCloseTo(front.local[i * 2 + 1] / 400); // v < 0 below the bottom line
    }
    expect(meshes.find((m) => m.piece.id === 'GLUE_WALL')!.artworkPanel).toBeNull();
    expect(meshes.find((m) => m.piece.id === 'LEFT_EAR_BACK_CORNER')!.artworkPanel).toBe('LEFT');
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
    expect(lines.cut.some((s) => s.piece.id === 'GLUE_EAR_CORNER' && s.from[0] !== s.to[0] && s.from[1] !== s.to[1])).toBe(true);
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
});
