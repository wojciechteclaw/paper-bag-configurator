// Procedural block-bottom bag body: panel geometries in panel-local mm and their folded pose in scene units.
//
// Face mapping (viewer standing in front of the bag, looking at FRONT):
//   FRONT → +Z, BACK → −Z, LEFT → −X, RIGHT → +X, BOTTOM → −Y. The top (+Y) is OPEN: no top face, no turn-in.
// Every panel uses panel-local coordinates (u, v) in mm *as seen from outside*: u to the right, v upwards,
// origin at the bottom-left corner. UV = (u / panelWidth, v / panelHeight), so artwork mapped with FILL covers
// the whole panel and stays continuous across the side-panel regions L, R, T (it only breaks when folded).
// Triangles are counter-clockwise in (u, v), i.e. front faces point outwards.
//
// Geometries are built once per dimension set; the fold animation only rewrites their position attributes.

import { BufferAttribute, BufferGeometry } from 'three';
import {
  foldSideRegionPoint,
  getSideGussetFoldState,
  getSidePanelCreases,
  getSidePanelRegions,
  type Polygon2,
  type Segment2,
} from '../domain/geometry/sideGusset';
import type { Dimensions, PanelPosition } from '../domain/types';
import { MM_TO_SCENE, PAPER_LAYER_GAP_MM } from './constants';

export type BagPanelId = PanelPosition | 'BOTTOM';
export const BAG_PANEL_IDS: readonly BagPanelId[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'BOTTOM'];

/** Rigid/deformable part a vertex belongs to. CREASE = centre crease line itself (midway between L and R). */
const Region = { FLAT: 0, L: 1, R: 2, T: 3, CREASE: 4 } as const;
type Region = (typeof Region)[keyof typeof Region];

/** Scalars of one fold pose, computed once per update (mm). */
export type BagFrame = {
  width: number;
  height: number;
  depth: number;
  foldProgress: number;
  sin: number;
  /** Distance of the front/back wall plane from the mid-plane z = 0 (includes the render-only layer gap). */
  wallOffset: number;
  /** Render-only layer gap scaled by sin θ. */
  gap: number;
};

export function getBagFrame({ width, height, depth }: Dimensions, foldProgress: number): BagFrame {
  const { angle, frontBackDistance } = getSideGussetFoldState(depth, foldProgress);
  const sin = Math.sin(angle);
  const gap = PAPER_LAYER_GAP_MM * sin;
  // Layers at 100 % from front to back: FRONT (+3g), L (+g), R (−g), BACK (−3g).
  return { width, height, depth, foldProgress, sin, gap, wallOffset: frontBackDistance / 2 + 3 * gap };
}

/**
 * Writes the scene-space position (x, y, z) of panel-local point (u, v) into `out` at `offset`.
 */
function placePoint(
  panel: BagPanelId,
  region: Region,
  u: number,
  v: number,
  f: BagFrame,
  out: Float32Array,
  offset: number,
) {
  const halfW = f.width / 2;
  let x: number;
  let y = v;
  let z: number;
  switch (panel) {
    case 'FRONT':
      x = -halfW + u;
      z = f.wallOffset;
      break;
    case 'BACK':
      x = halfW - u;
      z = -f.wallOffset;
      break;
    case 'BOTTOM':
      // TODO(docs/PRODUCTION.md): interim, non-rigid bottom — its depth just follows the front–back distance.
      // Replace with the real block-bottom kinematics (hinge on the back-bottom edge, turn-ins) once documented.
      x = -halfW + u;
      y = 0;
      z = f.depth > 0 ? -f.wallOffset + (v / f.depth) * 2 * f.wallOffset : 0;
      break;
    default: {
      // LEFT / RIGHT side gusset. `along` > 0 points to the wall hinged at local u = 0.
      let inset: number;
      let along: number;
      if (region === Region.T) {
        // TODO(docs/PRODUCTION.md): interim — T is the affine triangle between the two moved bottom corners and
        // the crease apex (not rigid). It will fold with the bottom once the bottom kinematics is implemented.
        inset = v * f.sin;
        along = f.depth > 0 ? f.wallOffset * (1 - (2 * u) / f.depth) : 0;
      } else {
        const hinged = region === Region.R ? 'R' : 'L';
        const p = foldSideRegionPoint(hinged, u, f.depth, f.foldProgress);
        inset = p.inset;
        along = p.along;
        if (region !== Region.CREASE && f.depth > 0) {
          // Render-only layer gap: +3g at the wall hinge → ±g at the centre crease.
          const fromHinge = region === Region.L ? u : f.depth - u;
          const shift = f.gap * (3 - (4 * fromHinge) / f.depth);
          along += region === Region.L ? shift : -shift;
        }
      }
      // RIGHT (+X) seen from outside: u runs from the front (+Z) to the back. LEFT (−X): from the back to the front.
      if (panel === 'RIGHT') {
        x = halfW - inset;
        z = along;
      } else {
        x = -halfW + inset;
        z = -along;
      }
    }
  }
  out[offset] = x * MM_TO_SCENE;
  out[offset + 1] = y * MM_TO_SCENE;
  out[offset + 2] = z * MM_TO_SCENE;
}

export type PanelMesh = {
  id: BagPanelId;
  geometry: BufferGeometry;
  /**
   * Panel-local (u, v) in mm per vertex. Wall panels may later carry the bottom allowance strip at
   * v ∈ [-allowance, 0) (domain `getWallPanelBounds`); `placePoint` already maps negative v straight down the wall,
   * and UVs stay normalised to the visible wall (v < 0 → uv.y < 0). Not rendered yet (docs/PRODUCTION.md).
   */
  local: Float32Array;
  regions: Uint8Array;
};

type RegionPolygon = { region: Region; polygon: Polygon2 };

const rect = (w: number, h: number): Polygon2 => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

function panelLayout(id: BagPanelId, d: Dimensions): { size: [number, number]; parts: RegionPolygon[] } {
  switch (id) {
    case 'FRONT':
    case 'BACK':
      return { size: [d.width, d.height], parts: [{ region: Region.FLAT, polygon: rect(d.width, d.height) }] };
    case 'BOTTOM':
      // u → +X, v → +Z (v = 0 at the back); seen from below, so the outward normal is −Y.
      return { size: [d.width, d.depth], parts: [{ region: Region.FLAT, polygon: rect(d.width, d.depth) }] };
    default: {
      const { L, R, T } = getSidePanelRegions(d);
      return {
        size: [d.depth, d.height],
        parts: [
          { region: Region.L, polygon: L },
          { region: Region.R, polygon: R },
          { region: Region.T, polygon: T },
        ],
      };
    }
  }
}

/**
 * Non-indexed geometry (flat normals per region, so creases read as sharp folds). Side panels get one geometry
 * group per region (L, R, T — all material index 0) sharing the panel's continuous UV space.
 */
export function createPanelMesh(id: BagPanelId, dimensions: Dimensions): PanelMesh {
  const { size, parts } = panelLayout(id, dimensions);
  const [sw, sh] = size;
  const local: number[] = [];
  const regions: Region[] = [];
  const geometry = new BufferGeometry();
  for (const { region, polygon } of parts) {
    const start = regions.length;
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
        local.push(p.x, p.y);
        regions.push(region);
      }
    }
    geometry.addGroup(start, regions.length - start, 0);
  }
  const count = regions.length;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uv[i * 2] = sw > 0 ? local[i * 2] / sw : 0;
    uv[i * 2 + 1] = sh > 0 ? local[i * 2 + 1] / sh : 0;
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return { id, geometry, local: new Float32Array(local), regions: Uint8Array.from(regions) };
}

/** Rewrites vertex positions (in place) and normals for the given pose. */
export function updatePanelMesh(mesh: PanelMesh, frame: BagFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const out = position.array as Float32Array;
  for (let i = 0; i < mesh.regions.length; i++) {
    placePoint(mesh.id, mesh.regions[i] as Region, mesh.local[i * 2], mesh.local[i * 2 + 1], frame, out, i * 3);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

type LineSpec = { panel: BagPanelId; region: Region; from: [number, number]; to: [number, number] };

/** Panel boundary lines: 4 vertical wall edges, the open top rim and the bottom outline (14 segments). */
export function getEdgeSpecs({ width: W, height: H, depth: D }: Dimensions): LineSpec[] {
  const specs: LineSpec[] = [];
  const add = (panel: BagPanelId, region: Region, from: [number, number], to: [number, number]) =>
    specs.push({ panel, region, from, to });
  for (const panel of ['FRONT', 'BACK'] as const) {
    add(panel, Region.FLAT, [0, 0], [0, H]);
    add(panel, Region.FLAT, [W, 0], [W, H]);
    add(panel, Region.FLAT, [0, H], [W, H]);
  }
  for (const panel of ['LEFT', 'RIGHT'] as const) {
    add(panel, Region.L, [0, H], [D / 2, H]);
    add(panel, Region.R, [D / 2, H], [D, H]);
  }
  add('BOTTOM', Region.FLAT, [0, 0], [W, 0]);
  add('BOTTOM', Region.FLAT, [W, 0], [W, D]);
  add('BOTTOM', Region.FLAT, [W, D], [0, D]);
  add('BOTTOM', Region.FLAT, [0, D], [0, 0]);
  return specs;
}

/** Side-panel crease lines from the domain helper (3 per side). */
export function getCreaseSpecs(dimensions: Dimensions): LineSpec[] {
  const { centre, left, right } = getSidePanelCreases(dimensions);
  const pt = (s: Segment2): [[number, number], [number, number]] => [
    [s.from.x, s.from.y],
    [s.to.x, s.to.y],
  ];
  return (['LEFT', 'RIGHT'] as const).flatMap((panel) => {
    const [c0, c1] = pt(centre);
    const [l0, l1] = pt(left);
    const [r0, r1] = pt(right);
    return [
      { panel, region: Region.CREASE, from: c0, to: c1 },
      { panel, region: Region.L, from: l0, to: l1 },
      { panel, region: Region.R, from: r0, to: r1 },
    ];
  });
}

/** Writes line segments as [x1,y1,z1,x2,y2,z2, …] in scene units into `out` (length = specs.length · 6). */
export function writeLineSegments(specs: readonly LineSpec[], frame: BagFrame, out: Float32Array) {
  specs.forEach((s, i) => {
    placePoint(s.panel, s.region, s.from[0], s.from[1], frame, out, i * 6);
    placePoint(s.panel, s.region, s.to[0], s.to[1], frame, out, i * 6 + 3);
  });
}
