// Handle meshes (twisted rope / flat strip + inner patch) built from the domain layout (src/domain/geometry/handles.ts).
//
// Handle-local frame (scene units), shared by FRONT and BACK: x = wall-local x (centred on the wall), y = height above
// the bottom fold line, z = distance from the INNER wall surface into the bag. Each wall gets one group; per fold frame
// only the group transform changes (see getHandleWallPose): FRONT faces −Z inside, so its group is turned by π about Y
// (handles are symmetric, the x mirror is harmless); BACK uses the rigid BACK_UPPER plane (handles sit above the pleat).
// Paper thicknesses and clearances below are render-only (not part of the domain).

import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DataTexture,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { polylineLength, type HandleLayout, type HandlePoint } from '../domain/geometry/handles';
import { getWallPlaneZ, type BagFrame } from './bagGeometry';
import { MM_TO_SCENE } from './constants';

export type HandleWall = 'FRONT' | 'BACK';
export const HANDLE_WALLS: readonly HandleWall[] = ['FRONT', 'BACK'];

/** Gap between the inner wall surface and the rope / strip, mm (keeps them off the wall's depth). */
export const HANDLE_WALL_CLEARANCE_MM = 0.2;
/** Gap between the patch and whatever it covers (wall or handle end), mm. */
export const PATCH_CLEARANCE_MM = 0.3;
/** Thickness of the multi-folded flat strip, mm. */
export const FLAT_STRIP_THICKNESS_MM = 0.8;
/** Length of one helical stripe tile along the rope, in rope diameters. */
const TWIST_TILE_DIAMETERS = 1.1;
/** Strands visible around the rope (stripes per turn of the texture). */
const TWIST_STRANDS = 3;
/**
 * Near the flat state the handle assembly (wall → rope/strip → patch) is pressed flat so it fits between the wall and
 * the next paper layer: it may use half of the front–back gap plus this share of one layer gap.
 */
const SQUASH_LAYER_SHARE = 0.8;
const MIN_SQUASH = 0.1;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Distance of the rope / strip centre line from the inner wall surface, mm. */
export function handleCentreOffset(layout: HandleLayout): number {
  const t = layout.params.type === 'TWISTED_PAPER' ? layout.params.width : FLAT_STRIP_THICKNESS_MM;
  return HANDLE_WALL_CLEARANCE_MM + t / 2;
}

/** Total thickness of wall clearance + handle + patch, mm (what has to fit between the walls when folded). */
export function handleStackThickness(layout: HandleLayout): number {
  return 2 * handleCentreOffset(layout) + PATCH_CLEARANCE_MM;
}

export type HandleWallPose = { z: number; rotationY: number; squash: number };

/**
 * Transform of one wall's handle group for a fold frame: on the wall plane (FRONT or BACK_UPPER, with the layer
 * push-back), facing into the bag, and squashed along the wall normal when the walls come closer than the handle
 * stack (open bag: 1; flat bag: fits under the first paper layer gap). Both loops then lie flat, upward, above the
 * top edge, on their own side of the mid-plane, so FRONT and BACK handles never intersect each other.
 */
export function getHandleWallPose(frame: BagFrame, wall: HandleWall, stackThickness: number): HandleWallPose {
  const available = frame.pose.gap / 2 + SQUASH_LAYER_SHARE * frame.layerShift;
  const squash = stackThickness > 0 ? clamp(available / stackThickness, MIN_SQUASH, 1) : 1;
  return { z: getWallPlaneZ(frame, wall), rotationY: wall === 'FRONT' ? Math.PI : 0, squash };
}

const toScene = (p: HandlePoint, z: number) => new Vector3(p.x * MM_TO_SCENE, p.y * MM_TO_SCENE, z * MM_TO_SCENE);

/** Twisted paper rope: a tube along the layout path; `length` in mm (for the twist texture repeat). */
export function createRopeGeometry(layout: HandleLayout): { geometry: TubeGeometry; length: number } {
  const z = handleCentreOffset(layout);
  const curve = new CatmullRomCurve3(
    layout.path.map((p) => toScene(p, z)),
    false,
    'centripetal',
  );
  curve.arcLengthDivisions = Math.max(200, layout.path.length * 4);
  const length = polylineLength(layout.path);
  const segments = clamp(Math.ceil(length / 1.5), 32, 600);
  const radius = (layout.params.width / 2) * MM_TO_SCENE;
  return { geometry: new TubeGeometry(curve, segments, radius, 12, false), length };
}

/** In-plane unit normals of a polyline (perpendicular to the averaged tangent). */
function planeNormals(path: readonly HandlePoint[]): HandlePoint[] {
  return path.map((_, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
}

/**
 * Flat paper strip: a thin band (width in the wall plane, thickness along the wall normal) along the layout path,
 * made of four sides (inner face, outer face, two edges). The ends are hidden under the patch, so they stay open.
 */
export function createStripGeometry(layout: HandleLayout): BufferGeometry {
  const { path } = layout;
  const normals = planeNormals(path);
  const half = layout.params.width / 2;
  const zc = handleCentreOffset(layout);
  const ht = FLAT_STRIP_THICKNESS_MM / 2;
  // Each side is a strip between two edge lines: (offset along in-plane normal, z) pairs.
  const sides: [[number, number], [number, number]][] = [
    [
      [-half, zc + ht],
      [half, zc + ht],
    ],
    [
      [half, zc - ht],
      [-half, zc - ht],
    ],
    [
      [half, zc + ht],
      [half, zc - ht],
    ],
    [
      [-half, zc - ht],
      [-half, zc + ht],
    ],
  ];
  const n = path.length;
  const positions = new Float32Array(sides.length * n * 2 * 3);
  const indices: number[] = [];
  sides.forEach((side, s) => {
    const base = s * n * 2;
    for (let i = 0; i < n; i++) {
      side.forEach(([off, z], k) => {
        const o = (base + i * 2 + k) * 3;
        positions[o] = (path[i].x + normals[i].x * off) * MM_TO_SCENE;
        positions[o + 1] = (path[i].y + normals[i].y * off) * MM_TO_SCENE;
        positions[o + 2] = z * MM_TO_SCENE;
      });
      if (i > 0) {
        const a = base + (i - 1) * 2;
        const b = base + i * 2;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Height of the patch above the inner wall surface at wall-local (x, y), mm. Flat strip: a uniform layer over it.
 * Twisted rope: the patch hugs the wall and bulges over the two rope ends (from their end upwards).
 */
export function patchOffset(layout: HandleLayout, x: number, y: number): number {
  const stack = handleStackThickness(layout);
  if (layout.params.type === 'FLAT_PAPER') return stack;
  const r = layout.params.width / 2;
  const a = layout.endSpacing / 2;
  const d = Math.min(Math.abs(x - a), Math.abs(x + a));
  const across = 1 - smoothstep(r, r * 4, d);
  const along = smoothstep(layout.endY - r * 2, layout.endY, y);
  return PATCH_CLEARANCE_MM + (stack - PATCH_CLEARANCE_MM) * across * along;
}

/** Flat rectangular paper patch (grid, bulging over the handle ends), facing into the bag. */
export function createPatchGeometry(layout: HandleLayout): BufferGeometry {
  const { x0, x1, y0, y1 } = layout.patch;
  const nx = clamp(Math.ceil((x1 - x0) / 1.25), 2, 400);
  const ny = clamp(Math.ceil((y1 - y0) / 2.5), 2, 100);
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
  const indices: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const y = y0 + ((y1 - y0) * j) / ny;
      const o = (j * (nx + 1) + i) * 3;
      positions[o] = x * MM_TO_SCENE;
      positions[o + 1] = y * MM_TO_SCENE;
      positions[o + 2] = patchOffset(layout, x, y) * MM_TO_SCENE;
      if (i > 0 && j > 0) {
        const a = (j - 1) * (nx + 1) + i - 1;
        const b = a + 1;
        const c = a + nx + 1;
        const e = c + 1;
        // Counter-clockwise seen from +z (inside the bag).
        indices.push(a, b, e, a, e, c);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Small tileable helical-stripe texture for the twisted rope (used as colour map and bump map). u runs along the rope,
 * v around it; stripes follow u + STRANDS·v = const, so they spiral around the tube.
 */
export function createTwistTexture(size = 64): DataTexture {
  const h = size / 2;
  const data = new Uint8Array(size * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < size; i++) {
      const phase = (i / size + (TWIST_STRANDS * j) / h) % 1;
      const ridge = Math.sqrt(Math.abs(Math.cos(Math.PI * phase)));
      const value = Math.round(255 * (0.72 + 0.28 * ridge));
      const o = (j * size + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = value;
      data[o + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, h, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Twist texture repeat along a rope of `length` mm and diameter `diameter` mm. */
export function twistRepeat(length: number, diameter: number): number {
  return Math.max(1, Math.round(length / (TWIST_TILE_DIAMETERS * diameter)));
}
