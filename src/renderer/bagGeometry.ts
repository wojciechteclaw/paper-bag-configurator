// Procedural block-bottom bag body: panel geometries in panel-local mm and their folded pose in scene units.
//
// Face mapping (viewer standing in front of the bag, looking at FRONT):
//   FRONT → +Z, BACK → −Z, LEFT → −X, RIGHT → +X, BOTTOM → −Y. The top (+Y) is OPEN: no top face, no turn-in.
// Every panel uses panel-local coordinates (u, v) in mm *as seen from outside* (BOTTOM: seen from below), origin at
// the bottom-left corner (src/domain/geometry/blockBottom.ts). UV = (u / panelWidth, v / panelHeight) of the visible
// wall, so artwork covers the wall 0..H and stays continuous across the fold regions — it only breaks on the creases
// once folded. Triangles are counter-clockwise in (u, v), i.e. front faces point outwards.
//
// Regions and kinematics come from the domain (docs/PRODUCTION.md §10): FRONT; BACK = BACK_UPPER + BACK_LOWER (Z-fold
// on the pleat y = D/2); each side = SIDE_FRONT, SIDE_BACK_UPPER, SIDE_BACK_LOWER, SIDE_T; BOTTOM = one rigid W × D
// region hinged on the front bottom crease (the glued bottom laminate), drawn as its visible pieces seen from below. Geometries are built once per dimension set; the fold animation only
// rewrites their position attributes.

import { BufferAttribute, BufferGeometry } from 'three';
import {
  findRegion,
  getBottomCreases,
  getPanelCreases,
  getPanelRegions,
  getVisibleBottomPieces,
  type BottomPieceId,
  type Crease,
  type FoldPanelId,
  type FoldRegionId,
  type PanelRegion,
} from '../domain/geometry/blockBottom';
import { foldPoint, getFoldPose, type FoldPose, type Vec3 } from '../domain/geometry/foldKinematics';
import type { Point2 } from '../domain/geometry/sideGusset';
import { getPanelSize } from '../domain/panels';
import type { Dimensions, PanelPosition } from '../domain/types';
import { BOTTOM_LINE_LIFT_MM, getBottomLayerOffsetMm, MM_TO_SCENE, PAPER_LAYER_GAP_MM } from './constants';

export type BagPanelId = FoldPanelId;
export const BAG_PANEL_IDS: readonly BagPanelId[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'BOTTOM'];

const REGION_IDS: readonly FoldRegionId[] = [
  'FRONT',
  'BACK_UPPER',
  'BACK_LOWER',
  'SIDE_FRONT',
  'SIDE_BACK_UPPER',
  'SIDE_BACK_LOWER',
  'SIDE_T',
  'BOTTOM',
];
const regionCode = (id: FoldRegionId) => REGION_IDS.indexOf(id);

/**
 * Stacking order of the layers in the flat bag, seen from the front (docs/PRODUCTION.md §10.5). Near p = 1 every
 * region lands in one plane; each layer is pushed back by `layer · PAPER_LAYER_GAP_MM` (render-only, faded in over
 * p ∈ [0.85, 1]) so they never z-fight. The open and partly folded bag stay geometrically exact.
 */
const LAYER: Record<FoldRegionId, number> = {
  FRONT: 0,
  SIDE_FRONT: 1,
  SIDE_T: 2,
  SIDE_BACK_UPPER: 3,
  SIDE_BACK_LOWER: 3,
  BACK_UPPER: 4,
  BACK_LOWER: 5,
  BOTTOM: 6,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One fold pose plus the render-only offsets, computed once per update (mm). */
export type BagFrame = {
  pose: FoldPose;
  /** Per-layer push-back towards −Z near the flat state. */
  layerShift: number;
  /** Shift along Z so the bag stays centred between FRONT and BACK while folding. */
  zCentre: number;
};

export function getBagFrame(dimensions: Dimensions, foldProgress: number): BagFrame {
  const pose = getFoldPose(dimensions, foldProgress);
  return {
    pose,
    layerShift: PAPER_LAYER_GAP_MM * smoothstep(0.85, 1, pose.foldProgress),
    zCentre: pose.gap / 2,
  };
}

/**
 * Scene-space z of the plane of a width wall (FRONT, or the rigid BACK_UPPER region above the pleat) in this frame,
 * including the render-only layer push-back. Used to attach handles and patches to their wall.
 */
export function getWallPlaneZ(frame: BagFrame, wall: 'FRONT' | 'BACK'): number {
  const z = wall === 'FRONT' ? 0 : -frame.pose.gap;
  const layer = wall === 'FRONT' ? LAYER.FRONT : LAYER.BACK_UPPER;
  return (z + frame.zCentre - layer * frame.layerShift) * MM_TO_SCENE;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Writes the scene-space position of panel-local point (u, v) of `region` into `out` at `offset`.
 * `lift` (mm) moves the point off the outer surface of the BOTTOM along its outward normal.
 */
function placePoint(
  panel: BagPanelId,
  region: FoldRegionId,
  u: number,
  v: number,
  f: BagFrame,
  out: Float32Array,
  offset: number,
  lift = 0,
) {
  const w = foldPoint(f.pose, panel, region, u, v, scratch);
  let { y, z } = w;
  if (lift !== 0) {
    // Outward normal of the rotated bottom: (0, −cos φ, −sin φ).
    y -= lift * Math.cos(f.pose.phi);
    z -= lift * Math.sin(f.pose.phi);
  }
  out[offset] = (w.x - f.pose.width / 2) * MM_TO_SCENE;
  out[offset + 1] = y * MM_TO_SCENE;
  out[offset + 2] = (z + f.zCentre - LAYER[region] * f.layerShift) * MM_TO_SCENE;
}

export type PanelMesh = {
  id: BagPanelId;
  /**
   * The wall whose artwork (texture + UV space) this mesh shows: the wall itself, or — for a piece of the bottom —
   * the wall whose bottom allowance forms it (FRONT flap / BACK flap). The bottom pieces show that artwork only when
   * the wall's placement is extended to the bottom (docs/SPEC.md §4f).
   */
  artworkPanel: PanelPosition;
  /** Bottom piece id (BOTTOM meshes only). */
  piece?: BottomPieceId;
  /** Outward offset from the bottom plane, mm (bottom pieces: client layer rule, `getBottomLayerOffsetMm`). */
  lift: number;
  geometry: BufferGeometry;
  /** Panel-local (u, v) in mm per vertex (BOTTOM: bottom-local, used for posing). */
  local: Float32Array;
  /** Index into REGION_IDS per vertex. */
  regions: Uint8Array;
};

type MeshPart = { region: FoldRegionId; polygon: readonly Point2[]; uvOf: (p: Point2) => [number, number] };

/**
 * Non-indexed geometry (flat normals per region, so creases read as sharp folds). One geometry group per part
 * (all material index 0); every vertex gets its UV from its part.
 */
function buildMesh(id: BagPanelId, artworkPanel: PanelPosition, parts: readonly MeshPart[], piece?: BottomPieceId): PanelMesh {
  const local: number[] = [];
  const uv: number[] = [];
  const regions: number[] = [];
  const geometry = new BufferGeometry();
  for (const { region, polygon, uvOf } of parts) {
    const start = regions.length;
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
        local.push(p.x, p.y);
        uv.push(...uvOf(p));
        regions.push(regionCode(region));
      }
    }
    geometry.addGroup(start, regions.length - start, 0);
  }
  const count = regions.length;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return {
    id,
    artworkPanel,
    ...(piece ? { piece } : {}),
    lift: piece ? getBottomLayerOffsetMm(piece) : 0,
    geometry,
    local: new Float32Array(local),
    regions: Uint8Array.from(regions),
  };
}

/** UV of a wall point: (x / panelWidth, y / H) of the visible wall; the bottom allowance continues below v = 0. */
function wallUv(position: PanelPosition, dimensions: Dimensions): (p: Point2) => [number, number] {
  const { width: sw, height: sh } = getPanelSize(position, dimensions);
  return (p) => [sw > 0 ? p.x / sw : 0, sh > 0 ? p.y / sh : 0];
}

/** Visible pieces of the formed bottom (seen from below), each in the UV space of the wall it comes from. */
function bottomParts(dimensions: Dimensions) {
  return getVisibleBottomPieces(dimensions)
    .filter((piece) => piece.visibleParts.length > 0)
    .map((piece) => {
      const uvOfWall = wallUv(piece.panel, dimensions);
      const uvOf = (p: Point2) => uvOfWall(piece.toPanel(p));
      const parts: MeshPart[] = piece.visibleParts.map((polygon) => ({ region: 'BOTTOM', polygon, uvOf }));
      return { piece, parts };
    });
}

/**
 * Mesh of one wall (its fold regions share the wall's continuous UV space), or of the whole BOTTOM (its visible
 * pieces as groups, each in the UV space of its source wall — trapezoids and side triangles).
 */
export function createPanelMesh(id: BagPanelId, dimensions: Dimensions): PanelMesh {
  if (id === 'BOTTOM') return buildMesh(id, 'FRONT', bottomParts(dimensions).flatMap(({ parts }) => parts));
  const uvOf = wallUv(id, dimensions);
  return buildMesh(
    id,
    id,
    getPanelRegions(id, dimensions).map(({ id: region, polygon }) => ({ region, polygon, uvOf })),
  );
}

/**
 * The bottom as one mesh per visible piece (so each can carry its own wall's texture), client model [K]: the BACK
 * trapezoid (outermost), the part of the FRONT trapezoid it leaves free and the two side triangles of the LEFT / RIGHT
 * side flaps between the trapezoid diagonals. They tile the W × D bottom exactly — no overlapping layers, no
 * z-fighting. The corner triangles (ears) are hidden between the side flaps and the trapezoids (`getVisibleBottomPieces`).
 */
export function createBottomPieceMeshes(dimensions: Dimensions): PanelMesh[] {
  return bottomParts(dimensions).map(({ piece, parts }) => buildMesh('BOTTOM', piece.panel, parts, piece.id));
}

/** Walls + bottom pieces: everything BagModel renders for the bag body. */
export function createBagMeshes(dimensions: Dimensions): PanelMesh[] {
  return [
    ...(['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const).map((id) => createPanelMesh(id, dimensions)),
    ...createBottomPieceMeshes(dimensions),
  ];
}

/** Rewrites vertex positions (in place) and normals for the given pose. */
export function updatePanelMesh(mesh: PanelMesh, frame: BagFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const out = position.array as Float32Array;
  for (let i = 0; i < mesh.regions.length; i++) {
    placePoint(mesh.id, REGION_IDS[mesh.regions[i]], mesh.local[i * 2], mesh.local[i * 2 + 1], frame, out, i * 3, mesh.lift);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

export type LineSpec = {
  panel: BagPanelId;
  region: FoldRegionId;
  from: [number, number];
  to: [number, number];
  /** mm off the outer surface (bottom underside lines only, so they don't show through from inside). */
  lift?: number;
};

type Pt = [number, number];

/** Line on `panel`, carried by the region containing its midpoint (segments never cross a crease). */
function onRegion(panel: BagPanelId, regions: readonly PanelRegion[], from: Pt, to: Pt, lift?: number): LineSpec {
  const mid = { x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 };
  const region = findRegion(regions, mid)?.id ?? regions[0].id;
  return { panel, region, from, to, lift };
}

/**
 * Panel boundary lines (same role as drei `Edges`): the four vertical wall edges (split at the BACK pleat), the open
 * top rim and the bottom outline (which is also the bottom fold line of all four walls). 16 segments.
 */
export function getEdgeSpecs(d: Dimensions): LineSpec[] {
  const { width: W, height: H, depth: D } = d;
  const h = Math.min(D / 2, H);
  const regionsOf = (panel: BagPanelId) => getPanelRegions(panel, d);
  const front = regionsOf('FRONT');
  const back = regionsOf('BACK');
  const bottom = regionsOf('BOTTOM');
  const specs: LineSpec[] = [
    onRegion('FRONT', front, [0, 0], [0, H]),
    onRegion('FRONT', front, [W, 0], [W, H]),
    onRegion('FRONT', front, [0, H], [W, H]),
    onRegion('BACK', back, [0, 0], [0, h]),
    onRegion('BACK', back, [0, h], [0, H]),
    onRegion('BACK', back, [W, 0], [W, h]),
    onRegion('BACK', back, [W, h], [W, H]),
    onRegion('BACK', back, [0, H], [W, H]),
  ];
  for (const panel of ['LEFT', 'RIGHT'] as const) {
    const side = regionsOf(panel);
    specs.push(onRegion(panel, side, [0, H], [D / 2, H]), onRegion(panel, side, [D / 2, H], [D, H]));
  }
  specs.push(
    onRegion('BOTTOM', bottom, [0, 0], [W, 0]),
    onRegion('BOTTOM', bottom, [W, 0], [W, D]),
    onRegion('BOTTOM', bottom, [W, D], [0, D]),
    onRegion('BOTTOM', bottom, [0, D], [0, 0]),
  );
  return specs;
}

const toPts = (c: Crease): [Pt, Pt] => [
  [c.segment.from.x, c.segment.from.y],
  [c.segment.to.x, c.segment.to.y],
];

/**
 * Crease lines from the domain: the BACK pleat, the side creases (centre, two 45°, pleat on the back half) and the
 * lines on the bottom underside (the visible trapezoid diagonals — the "X" — and the BACK trapezoid's end edge = glue
 * seam). 14 segments.
 */
export function getCreaseSpecs(d: Dimensions): LineSpec[] {
  const specs: LineSpec[] = [];
  for (const panel of ['BACK', 'LEFT', 'RIGHT'] as const) {
    const regions = getPanelRegions(panel, d);
    for (const c of getPanelCreases(panel, d)) specs.push(onRegion(panel, regions, ...toPts(c)));
  }
  const bottom = getPanelRegions('BOTTOM', d);
  for (const c of getBottomCreases(d)) specs.push(onRegion('BOTTOM', bottom, ...toPts(c), BOTTOM_LINE_LIFT_MM));
  return specs;
}

/** Writes line segments as [x1,y1,z1,x2,y2,z2, …] in scene units into `out` (length = specs.length · 6). */
export function writeLineSegments(specs: readonly LineSpec[], frame: BagFrame, out: Float32Array) {
  specs.forEach((s, i) => {
    placePoint(s.panel, s.region, s.from[0], s.from[1], frame, out, i * 6, s.lift);
    placePoint(s.panel, s.region, s.to[0], s.to[1], frame, out, i * 6 + 3, s.lift);
  });
}
