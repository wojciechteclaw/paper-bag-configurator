// Assembly from the sheet (docs/SPEC.md §4a/§4c, docs/PRODUCTION.md §10.8): the flat dieline in 3D folding into the
// open bag. One mesh per rigid piece of `getAssemblyPieces` (walls, flaps, side triangles, ears, chamfered glue flap);
// every vertex is placed per frame by `assemblyPoint` (domain, mm) plus a render-only paper-layer offset, then moved
// into scene units around the view centre suggested by the pose.
//
// UV = the wall's continuous artwork space (u / panelWidth, v / H), shared with the fold model (bagGeometry.ts): the
// allowance pieces continue it below v = 0, so artwork extended to the bottom (SPEC §4f) is continuous on the sheet
// and folds with the flaps. The glue flap carries no print. Lines: the dieline's cut outline and creases, split at
// the piece boundaries and carried by the piece under each part.

import { BufferAttribute, BufferGeometry } from 'three';
import { DIELINE_RULES } from '../domain/config/productionRules';
import { buildDieline } from '../domain/dieline';
import {
  assemblyInwardNormal,
  EAR_BEND_ANGLE,
  assemblyPoint,
  findAssemblyPiece,
  getAssemblyPieces,
  getAssemblyPose,
  getAssemblySheetOrigins,
  type AssemblyPiece,
  type AssemblyPose,
  type AssemblySheetPanel,
} from '../domain/geometry/assemblyKinematics';
import type { Vec3 } from '../domain/geometry/foldKinematics';
import type { Point2 } from '../domain/geometry/sideGusset';
import { getBottomAllowance } from '../domain/geometry/tube';
import { getPanelSize } from '../domain/panels';
import type { Dimensions, PanelPosition } from '../domain/types';
import { ASSEMBLY_LAYER_GAP_MM, MM_TO_SCENE } from './constants';

export type AssemblyMesh = {
  piece: AssemblyPiece;
  /** Wall whose artwork (texture + UV space) the piece shows; null for the unprinted glue flap. */
  artworkPanel: PanelPosition | null;
  geometry: BufferGeometry;
  /** Panel-local (u, v) mm per vertex. */
  local: Float32Array;
};

/** One assembly pose plus the render-only offsets (mm), computed once per frame. */
export type AssemblyFrame = {
  pose: AssemblyPose;
  /** Paper-layer offset per layer, mm (fades in while the glue flap closes, so the flat sheet stays exactly flat). */
  layerShift: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function getAssemblyFrame(dimensions: Dimensions, assemblyProgress: number): AssemblyFrame {
  const pose = getAssemblyPose(dimensions, assemblyProgress);
  return { pose, layerShift: ASSEMBLY_LAYER_GAP_MM * smoothstep(0.3, 0.4, pose.assemblyProgress) };
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/** Scene-space position of a piece point (with the layer offset along the piece's inward normal). */
function place(frame: AssemblyFrame, piece: AssemblyPiece, u: number, v: number, inward: Vec3, out: Float32Array, o: number) {
  const { pose, layerShift } = frame;
  const w = assemblyPoint(pose, piece, u, v, scratch);
  const shift = piece.layer * layerShift;
  out[o] = (w.x + inward.x * shift - pose.view.centreX) * MM_TO_SCENE;
  out[o + 1] = (w.y + inward.y * shift + pose.view.lift) * MM_TO_SCENE;
  out[o + 2] = (w.z + inward.z * shift - pose.view.centreZ) * MM_TO_SCENE;
}

function wallUv(panel: PanelPosition, dimensions: Dimensions) {
  const { width, height } = getPanelSize(panel, dimensions);
  return (p: Point2): [number, number] => [width > 0 ? p.x / width : 0, height > 0 ? p.y / height : 0];
}

/** Meshes of every sheet piece (built once per dimension set; posing only rewrites positions). */
export function createAssemblyMeshes(dimensions: Dimensions): AssemblyMesh[] {
  return getAssemblyPieces(dimensions).map((piece) => {
    const artworkPanel = piece.panel === 'GLUE' ? null : piece.panel;
    const uvOf = artworkPanel ? wallUv(artworkPanel, dimensions) : () => [0, 0] as [number, number];
    const local: number[] = [];
    const uv: number[] = [];
    const polygon = piece.polygon;
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
        local.push(p.x, p.y);
        uv.push(...uvOf(p));
      }
    }
    const count = local.length / 2;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    return { piece, artworkPanel, geometry, local: new Float32Array(local) };
  });
}

export function updateAssemblyMesh(mesh: AssemblyMesh, frame: AssemblyFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const out = position.array as Float32Array;
  const inward = assemblyInwardNormal(frame.pose, mesh.piece);
  for (let i = 0; i < mesh.local.length / 2; i++) {
    place(frame, mesh.piece, mesh.local[i * 2], mesh.local[i * 2 + 1], inward, out, i * 3);
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

export type AssemblyLineSpec = { piece: AssemblyPiece; from: [number, number]; to: [number, number] };

type SheetSegment = { from: Point2; to: Point2 };

/**
 * Splits sheet segments at the column boundaries, the side centre lines and the bottom-line / glue-chamfer levels,
 * and attaches every part to the piece under its midpoint (panel-local coordinates of its column).
 */
function toPieceLines(segments: readonly SheetSegment[], dimensions: Dimensions, pieces: readonly AssemblyPiece[]): AssemblyLineSpec[] {
  const { width: W, depth: D } = dimensions;
  const a = getBottomAllowance(dimensions);
  const s = DIELINE_RULES.glueFlapWidth;
  const origins = getAssemblySheetOrigins(dimensions);
  const columns: { panel: AssemblySheetPanel; x0: number; x1: number }[] = [
    { panel: 'LEFT', x0: origins.LEFT, x1: origins.FRONT },
    { panel: 'FRONT', x0: origins.FRONT, x1: origins.RIGHT },
    { panel: 'RIGHT', x0: origins.RIGHT, x1: origins.BACK },
    { panel: 'BACK', x0: origins.BACK, x1: origins.GLUE },
    { panel: 'GLUE', x0: origins.GLUE, x1: origins.GLUE + s },
  ];
  // Column edges, side centres, ear bend lines at the tube end; bottom line, glue triangle and glue-ear bend levels.
  const bend = Math.min(D / 2, a * Math.tan(EAR_BEND_ANGLE));
  const xs = [bend, D / 2, D - bend, D, W + D, W + D + bend, W + 1.5 * D, W + 2 * D - bend, W + 2 * D, 2 * W + 2 * D];
  const ys = [a, a - s, a - Math.min(a - s, s / Math.tan(EAR_BEND_ANGLE))];
  const specs: AssemblyLineSpec[] = [];
  for (const { from, to } of segments) {
    const ts = [0, 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    for (const x of xs) if (Math.abs(dx) > 1e-9) ts.push((x - from.x) / dx);
    for (const y of ys) if (Math.abs(dy) > 1e-9) ts.push((y - from.y) / dy);
    const cuts = [...new Set(ts.filter((t) => t >= 0 && t <= 1).map((t) => Math.round(t * 1e9) / 1e9))].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const [t0, t1] = [cuts[i], cuts[i + 1]];
      if (t1 - t0 < 1e-9) continue;
      const mx = from.x + dx * ((t0 + t1) / 2);
      const my = from.y + dy * ((t0 + t1) / 2);
      const column = columns.find((c) => mx >= c.x0 - 1e-9 && mx <= c.x1 + 1e-9);
      if (!column) continue;
      const toLocal = (t: number): [number, number] => [from.x + dx * t - column.x0, from.y + dy * t - a];
      const piece = findAssemblyPiece(pieces, column.panel, { x: mx - column.x0, y: my - a }, 1e-6);
      if (piece) specs.push({ piece, from: toLocal(t0), to: toLocal(t1) });
    }
  }
  return specs;
}

/** Cut outline (chamfered glue flap included) and all creases of the dieline, as lines on the assembly pieces. */
export function getAssemblyLineSpecs(dimensions: Dimensions): { cut: AssemblyLineSpec[]; crease: AssemblyLineSpec[] } {
  const dieline = buildDieline({ dimensions, handle: null });
  const pieces = getAssemblyPieces(dimensions);
  const cutSegments = dieline.cuts.flatMap((polygon) =>
    polygon.map((from, i) => ({ from, to: polygon[(i + 1) % polygon.length] })),
  );
  return {
    cut: toPieceLines(cutSegments, dimensions, pieces),
    crease: toPieceLines(dieline.creases, dimensions, pieces),
  };
}

/** Writes line segments as [x1,y1,z1,x2,y2,z2, …] in scene units (length = specs.length · 6). */
export function writeAssemblyLines(specs: readonly AssemblyLineSpec[], frame: AssemblyFrame, out: Float32Array) {
  specs.forEach((spec, i) => {
    const inward = assemblyInwardNormal(frame.pose, spec.piece);
    place(frame, spec.piece, spec.from[0], spec.from[1], inward, out, i * 6);
    place(frame, spec.piece, spec.to[0], spec.to[1], inward, out, i * 6 + 3);
  });
}

/**
 * Row-major 4 × 4 transform of a wall's handle group during the assembly: handle-local frame (scene units, x along
 * the wall centred, y up from the bottom line, z into the bag — handleGeometry.ts) → scene, following the wall's rigid
 * transform. Handle-local (x, y, z) sits at panel-local (W/2 − x, y) on the inside (flat −z) of the wall; for the
 * formed bag this equals the fold model's FRONT (turned by π) / BACK poses.
 */
export function getAssemblyHandleMatrix(frame: AssemblyFrame, wall: 'FRONT' | 'BACK'): number[] {
  const { pose } = frame;
  const m = pose.transforms[wall === 'FRONT' ? 'FRONT_WALL' : 'BACK_WALL'];
  const r = m.r;
  // R' = R · diag(−1, 1, −1); T = k · (R · (flatX + W/2, 0, 0) + t − view centre).
  const cx = pose.flatX[wall] + pose.width / 2;
  const tx = (r[0] * cx + m.t.x - pose.view.centreX) * MM_TO_SCENE;
  const ty = (r[3] * cx + m.t.y + pose.view.lift) * MM_TO_SCENE;
  const tz = (r[6] * cx + m.t.z - pose.view.centreZ) * MM_TO_SCENE;
  return [-r[0], r[1], -r[2], tx, -r[3], r[4], -r[5], ty, -r[6], r[7], -r[8], tz, 0, 0, 0, 1];
}

/** Extent of the flat sheet for the camera fit, mm: bounding radius and centre height above the floor. */
export function getSheetViewExtent(dimensions: Dimensions): { radius: number; centreY: number } {
  const dieline = buildDieline({ dimensions, handle: null });
  const { width, height } = dieline.sheet;
  return { radius: 0.5 * Math.hypot(width, height), centreY: height / 2 };
}
