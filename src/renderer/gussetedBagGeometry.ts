// Procedural geometry of the gusseted bag with a fold-over bottom (FOLDED): the printed sheet forming into the flat
// bag, then opening (docs/SPEC.md §4i, docs/PRODUCTION.md §13.6). Kept apart from the block-bottom bagGeometry /
// assemblyGeometry: the shape comes from the rigid-facet kinematics of `getGussetedPose`
// (src/domain/geometry/gussetedAssembly.ts); this module only writes it into three.js buffers (mm → scene units here).
//
// One mesh per rigid facet of `getGussetedPieces` (walls, gusset triangles, glued bands, bottom strips, seam flap),
// built once per dimension set; posing rewrites positions and normals in place. UV = the wall's continuous artwork
// space (x / panel width, y / H — the same basis as the block bottom, so `computePanelUvTransform` places artwork
// identically in 2D and 3D, and the strip continues it below y = 0 for "extend to bottom"). The seam flap carries no
// print. Lines: the dieline's cut outline and creases, split at the facet boundaries and carried by the facet under
// each part, so they follow the sheet through every phase.

import { BufferAttribute, BufferGeometry } from 'three';
import { buildGussetedDieline } from '../domain/dieline';
import { pointInConvexPolygon } from '../domain/geometry/blockBottom';
import {
  getGussetedFlapWidth,
  getGussetedLayerSteps,
  getGussetedPieces,
  getGussetedPose,
  getGussetedSheetOrigins,
  gussetedPoint,
  gussetedPrintNormal,
  type GussetedPiece,
  type GussetedPose,
} from '../domain/geometry/gussetedAssembly';
import { getBottomFoldDepth, type GussetedDimensions, type Vec3 } from '../domain/geometry/gussetedBag';
import type { Point2 } from '../domain/geometry/sideGusset';
import { getPanelSize } from '../domain/panels';
import type { BagWindow, PanelPosition } from '../domain/types';
import { getWindowFilm, getWindowOpening, isInWindowOpening, type WindowOpening } from '../domain/window';
import { MM_TO_SCENE, WINDOW_FILM_INSET_MM } from './constants';

/**
 * Render-only paper-layer step, mm (client limit ≤ 0.1 mm per step): facets are offset along their print-side normal
 * by `getGussetedLayerSteps` steps, so stacked layers of the flat bag and the folded bottom never z-fight.
 */
export const GUSSETED_LAYER_STEP_MM = 0.1;

export type GussetedMesh = {
  piece: GussetedPiece;
  /** Wall whose artwork (texture + UV space) the facet shows; null for the unprinted seam flap. */
  artworkPanel: PanelPosition | null;
  geometry: BufferGeometry;
  /** Panel-local (x, y) mm per vertex (non-indexed triangles). */
  local: Float32Array;
  /** Window film on a FRONT facet: UV = 0..1 over the film rectangle, drawn with the film material. */
  film?: boolean;
};

/** One pose plus the render settings, computed once per frame. */
export type GussetedFrame = { pose: GussetedPose; step: number };

export function getGussetedFrame(
  dimensions: GussetedDimensions,
  glueFlapWidth: number,
  timeline: number,
  step = GUSSETED_LAYER_STEP_MM,
): GussetedFrame {
  return { pose: getGussetedPose(dimensions, glueFlapWidth, timeline), step };
}

const ARTWORK_PANEL: Record<GussetedPiece['link'], PanelPosition | null> = {
  FRONT: 'FRONT',
  BACK: 'BACK',
  RF: 'RIGHT',
  RB: 'RIGHT',
  LF: 'LEFT',
  LB: 'LEFT',
  GLUE: null,
};

/** The window opening on FRONT (panel-local mm), or null. */
export function getFrontOpening(dimensions: GussetedDimensions, window: BagWindow | null): WindowOpening | null {
  if (!window) return null;
  const opening = getWindowOpening(window, dimensions);
  return opening.width > 0 && opening.height > 0 ? opening : null;
}

type Rect2 = { x0: number; y0: number; x1: number; y1: number };

function bounds(polygon: readonly Point2[]): Rect2 {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Triangles of a rectangle minus the window opening (cells of the grid through the opening edges). */
function rectWithHole(r: Rect2, opening: WindowOpening): Point2[][] {
  const clampX = (x: number) => Math.min(r.x1, Math.max(r.x0, x));
  const clampY = (y: number) => Math.min(r.y1, Math.max(r.y0, y));
  const xs = [...new Set([r.x0, clampX(opening.x), clampX(opening.x + opening.width), r.x1])].sort((a, b) => a - b);
  const ys = [...new Set([r.y0, clampY(opening.y), clampY(opening.y + opening.height), r.y1])].sort((a, b) => a - b);
  const triangles: Point2[][] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      if (xs[i + 1] - xs[i] < 1e-9 || ys[j + 1] - ys[j] < 1e-9) continue;
      if (isInWindowOpening(opening, (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)) continue;
      const [a, b, c, d] = [
        { x: xs[i], y: ys[j] },
        { x: xs[i + 1], y: ys[j] },
        { x: xs[i + 1], y: ys[j + 1] },
        { x: xs[i], y: ys[j + 1] },
      ];
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return triangles;
}

function fan(polygon: readonly Point2[]): Point2[][] {
  const triangles: Point2[][] = [];
  for (let i = 1; i < polygon.length - 1; i++) triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
  return triangles;
}

function meshOf(piece: GussetedPiece, artworkPanel: PanelPosition | null, triangles: Point2[][], uvOf: (p: Point2) => [number, number], film = false): GussetedMesh {
  const local: number[] = [];
  const uv: number[] = [];
  for (const triangle of triangles) {
    for (const p of triangle) {
      local.push(p.x, p.y);
      uv.push(...uvOf(p));
    }
  }
  const count = local.length / 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  return { piece, artworkPanel, geometry, local: new Float32Array(local), ...(film ? { film: true } : {}) };
}

/**
 * Meshes of every facet (built once per dimension set; posing only rewrites positions and normals). With a window
 * (docs/SPEC.md §2b) FRONT's facets leave the opening out (a real hole: the interior shows through, the artwork is
 * masked) and film meshes cover the film rectangle (opening + overlap), one per FRONT facet it lies on, posed with that
 * facet WINDOW_FILM_INSET_MM inside FRONT — in every phase of the timeline.
 */
export function createGussetedMeshes(dimensions: GussetedDimensions, glueFlapWidth: number, window: BagWindow | null = null): GussetedMesh[] {
  const opening = getFrontOpening(dimensions, window);
  const pieces = getGussetedPieces(dimensions, glueFlapWidth);
  const meshes = pieces.map((piece) => {
    const artworkPanel = ARTWORK_PANEL[piece.link];
    const size = artworkPanel ? getPanelSize(artworkPanel, dimensions) : null;
    const uvOf = (p: Point2): [number, number] => [
      size && size.width > 0 ? p.x / size.width : 0,
      size && size.height > 0 ? p.y / size.height : 0,
    ];
    const triangles = opening && piece.link === 'FRONT' ? rectWithHole(bounds(piece.polygon), opening) : fan(piece.polygon);
    return meshOf(piece, artworkPanel, triangles, uvOf);
  });
  if (opening && window) {
    const film = getWindowFilm(window, dimensions);
    const f = { x0: film.x, y0: film.y, x1: film.x + film.width, y1: film.y + film.height };
    const uvOf = (p: Point2): [number, number] => [(p.x - f.x0) / film.width, (p.y - f.y0) / film.height];
    for (const piece of pieces) {
      if (piece.link !== 'FRONT' || piece.strip) continue;
      const r = bounds(piece.polygon);
      const part = { x0: Math.max(r.x0, f.x0), y0: Math.max(r.y0, f.y0), x1: Math.min(r.x1, f.x1), y1: Math.min(r.y1, f.y1) };
      if (part.x1 - part.x0 < 1e-9 || part.y1 - part.y0 < 1e-9) continue;
      const corners = [
        { x: part.x0, y: part.y0 },
        { x: part.x1, y: part.y0 },
        { x: part.x1, y: part.y1 },
        { x: part.x0, y: part.y1 },
      ];
      meshes.push(meshOf(piece, null, fan(corners), uvOf, true));
    }
  }
  return meshes;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/** Scene-space position of a facet point: pose + layer offset along the print normal, shifted by the view. */
function place(frame: GussetedFrame, piece: GussetedPiece, x: number, y: number, normal: Vec3, shift: number, out: Float32Array, o: number) {
  const { pose } = frame;
  const w = gussetedPoint(pose, piece, x, y, scratch);
  out[o] = (w.x + normal.x * shift - pose.view.centreX) * MM_TO_SCENE;
  out[o + 1] = (w.y + normal.y * shift + pose.view.lift) * MM_TO_SCENE;
  out[o + 2] = (w.z + normal.z * shift) * MM_TO_SCENE;
}

export function updateGussetedMesh(mesh: GussetedMesh, frame: GussetedFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const normals = mesh.geometry.getAttribute('normal') as BufferAttribute;
  const out = position.array as Float32Array;
  const n = normals.array as Float32Array;
  const normal = gussetedPrintNormal(frame.pose, mesh.piece);
  // The window film lies against FRONT's inner (unprinted) face: FRONT's layer offset minus the film inset.
  const shift = getGussetedLayerSteps(frame.pose, mesh.piece) * frame.step - (mesh.film ? WINDOW_FILM_INSET_MM : 0);
  for (let i = 0; i < mesh.local.length / 2; i++) {
    place(frame, mesh.piece, mesh.local[i * 2], mesh.local[i * 2 + 1], normal, shift, out, i * 3);
    n[i * 3] = normal.x;
    n[i * 3 + 1] = normal.y;
    n[i * 3 + 2] = normal.z;
  }
  position.needsUpdate = true;
  normals.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

/** A line segment on one facet, panel-local mm. */
export type GussetedLineSpec = { piece: GussetedPiece; from: [number, number]; to: [number, number] };

type SheetSegment = { from: Point2; to: Point2 };

/**
 * Splits sheet segments wherever they cross a facet edge and attaches every part to the first facet under its
 * midpoint (walls before gusset halves before the flap, glued bands / walls before strips — so a line on a boundary
 * rides on the outer layer of the flat bag).
 */
function toPieceLines(segments: readonly SheetSegment[], dimensions: GussetedDimensions, pieces: readonly GussetedPiece[]): GussetedLineSpec[] {
  const b = getBottomFoldDepth(dimensions);
  const origins = getGussetedSheetOrigins(dimensions);
  const edges = pieces.flatMap((piece) =>
    piece.polygon.map((p, i) => {
      const q = piece.polygon[(i + 1) % piece.polygon.length];
      const ox = origins[piece.column];
      return { from: { x: ox + p.x, y: p.y + b }, to: { x: ox + q.x, y: q.y + b } };
    }),
  );
  const specs: GussetedLineSpec[] = [];
  for (const { from, to } of segments) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ts = [0, 1];
    for (const e of edges) {
      const ex = e.to.x - e.from.x;
      const ey = e.to.y - e.from.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = e.from.x - from.x;
      const wy = e.from.y - from.y;
      const t = (wx * ey - wy * ex) / den;
      const u = (wx * dy - wy * dx) / den;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
    const cuts = [...new Set(ts.map((t) => Math.round(t * 1e9) / 1e9))].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const [t0, t1] = [cuts[i], cuts[i + 1]];
      if (t1 - t0 < 1e-9) continue;
      const mid = { x: from.x + dx * ((t0 + t1) / 2), y: from.y + dy * ((t0 + t1) / 2) };
      const piece = pieces.find((p) => pointInConvexPolygon({ x: mid.x - origins[p.column], y: mid.y - b }, p.polygon, 1e-6));
      if (!piece) continue;
      const toLocal = (t: number): [number, number] => [from.x + dx * t - origins[piece.column], from.y + dy * t - b];
      specs.push({ piece, from: toLocal(t0), to: toLocal(t1) });
    }
  }
  return specs;
}

/**
 * Lines of the gusseted bag, from its dieline: `edges` = the cut outline, the bottom fold line C1, the tube edges C2
 * and the seam-flap hinge C3 (they are the bag's edges once formed); `creases` = the gusset centres C4. The seam flap
 * is drawn at its 3D width (`getGussetedFlapWidth`).
 */
export function getGussetedLineSpecs(
  dimensions: GussetedDimensions,
  glueFlapWidth: number,
  window: BagWindow | null = null,
): { edges: GussetedLineSpec[]; creases: GussetedLineSpec[] } {
  const s = getGussetedFlapWidth(dimensions, glueFlapWidth);
  // The window's cut (a notch in the outline or an inner contour) comes with the dieline's cuts.
  const dieline = buildGussetedDieline({ dimensions, glueFlapWidth: s, bottomFoldDepth: getBottomFoldDepth(dimensions), window });
  const pieces = [...getGussetedPieces(dimensions, s)].sort((p, q) => Number(p.strip) - Number(q.strip) || rank(p) - rank(q));
  const cut = dieline.cuts.flatMap((polygon) => polygon.map((from, i) => ({ from, to: polygon[(i + 1) % polygon.length] })));
  const creaseLines = dieline.creases.filter((c) => c.code === 'C4');
  const edgeCreases = dieline.creases.filter((c) => c.code !== 'C4');
  return {
    edges: toPieceLines([...cut, ...edgeCreases], dimensions, pieces),
    creases: toPieceLines(creaseLines, dimensions, pieces),
  };
}

/** Line-carrier priority: walls, then the gusset halves next to FRONT / BACK, then the flap. */
function rank(piece: GussetedPiece): number {
  return piece.link === 'FRONT' || piece.link === 'BACK' ? 0 : piece.link === 'GLUE' ? 2 : 1;
}

/** Writes the posed segments (scene units, 6 floats each) into `out`. */
export function writeGussetedLines(specs: readonly GussetedLineSpec[], frame: GussetedFrame, out: Float32Array) {
  specs.forEach((spec, i) => {
    const normal = gussetedPrintNormal(frame.pose, spec.piece);
    const shift = getGussetedLayerSteps(frame.pose, spec.piece) * frame.step;
    place(frame, spec.piece, spec.from[0], spec.from[1], normal, shift, out, i * 6);
    place(frame, spec.piece, spec.to[0], spec.to[1], normal, shift, out, i * 6 + 3);
  });
}

/** Extent of the flat sheet for the camera fit, mm: bounding radius and centre height above the floor. */
export function getGussetedSheetViewExtent(dimensions: GussetedDimensions, glueFlapWidth: number): { radius: number; centreY: number } {
  const { width: W, depth: F, height: H } = dimensions;
  const width = 2 * W + 2 * F + getGussetedFlapWidth(dimensions, glueFlapWidth);
  const height = H + getBottomFoldDepth(dimensions);
  return { radius: 0.5 * Math.hypot(width, height), centreY: height / 2 };
}
