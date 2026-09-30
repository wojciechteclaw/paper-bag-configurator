// Procedural geometry of the gusseted-bag bag with a fold-over bottom (FOLDED). Kept apart from the block-bottom
// bagGeometry / assemblyGeometry: the shape comes from `getGussetedPoint` (src/domain/geometry/gussetedBag.ts), this
// module only samples it into three.js buffers (mm → scene units here, nowhere else).
//
// Meshes: the four walls (FRONT, BACK, gussets LEFT / RIGHT) above the bottom fold line, each a grid in its own
// panel-local mm with UV = (x / panel width, y / H) — the same UV basis as the block bottom, so the shared
// `computePanelUvTransform` places artwork identically in 2D and 3D — plus the fold-over strip of every wall
// (y ∈ [−b, 0]) folded onto the BACK [K]. The strip is unprinted in the MVP (docs/PRODUCTION.md §13.5).

import { BufferAttribute, BufferGeometry } from 'three';
import { getBottomFoldDepth, getGussetedPoint, getGussetOpeningRise } from '../domain/geometry/gussetedBag';
import { getPanelSize } from '../domain/panels';
import type { Dimensions, PanelPosition } from '../domain/types';
import { MM_TO_SCENE } from './constants';

/** Render-only paper-layer separation of the flat parts (folded bag, glued bottom), mm. */
export const GUSSETED_LAYER_GAP_MM = 0.4;

const WALLS: readonly PanelPosition[] = ['FRONT', 'RIGHT', 'BACK', 'LEFT'];
/** Rows across the opening zone (where the gussets turn), columns across a gusset (even: the centre crease is a column). */
const OPENING_ROWS = 24;
const GUSSET_COLUMNS = 8;

export type GussetedMesh = {
  /** Wall, or `<wall>-STRIP` for its fold-over bottom strip. */
  id: string;
  panel: PanelPosition;
  strip: boolean;
  geometry: BufferGeometry;
  /** Panel-local mm of every vertex, in buffer order. */
  samples: { x: number; y: number }[];
};

export type GussetedFrame = { dimensions: Dimensions; open: number; gap: number };

export function getGussetedFrame(dimensions: Dimensions, foldProgress: number, gap = GUSSETED_LAYER_GAP_MM): GussetedFrame {
  const fold = Number.isFinite(foldProgress) ? Math.min(1, Math.max(0, foldProgress)) : 0;
  return { dimensions, open: 1 - fold, gap };
}

/** Heights of the wall rows: dense where the gussets turn (b … b + y_r), sparse above (the shape is linear in y). */
export function getWallRows(dimensions: Dimensions): number[] {
  const H = dimensions.height;
  const b = getBottomFoldDepth(dimensions);
  const rise = getGussetOpeningRise(dimensions);
  const rows = new Set<number>([0, b, H]);
  for (let i = 0; i <= OPENING_ROWS; i++) rows.add(Math.min(H, b + (rise * i) / OPENING_ROWS));
  const top = b + rise;
  for (let i = 1; i < 4; i++) rows.add(top + ((H - top) * i) / 4);
  return [...rows].filter((y) => y >= 0 && y <= H).sort((p, q) => p - q);
}

function getColumns(panel: PanelPosition, dimensions: Dimensions): number[] {
  const { width } = getPanelSize(panel, dimensions);
  const count = panel === 'LEFT' || panel === 'RIGHT' ? GUSSET_COLUMNS : 2;
  return Array.from({ length: count + 1 }, (_, i) => (width * i) / count);
}

function createGrid(xs: number[], ys: number[], panelWidth: number, height: number) {
  const samples = ys.flatMap((y) => xs.map((x) => ({ x, y })));
  const uv = new Float32Array(samples.length * 2);
  samples.forEach(({ x, y }, i) => {
    uv[2 * i] = panelWidth > 0 ? x / panelWidth : 0;
    uv[2 * i + 1] = height > 0 ? y / height : 0;
  });
  const index: number[] = [];
  const stride = xs.length;
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      const a = r * stride + c;
      // Counter-clockwise in panel-local (x right, y up, seen from outside) → the front face points out of the bag.
      index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(samples.length * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return { geometry, samples };
}

/** One mesh per wall and per fold strip; positions are written by `updateGussetedMesh`. */
export function createGussetedMeshes(dimensions: Dimensions): GussetedMesh[] {
  const rows = getWallRows(dimensions);
  const b = getBottomFoldDepth(dimensions);
  return WALLS.flatMap((panel): GussetedMesh[] => {
    const { width } = getPanelSize(panel, dimensions);
    const xs = getColumns(panel, dimensions);
    const wall = createGrid(xs, rows, width, dimensions.height);
    const meshes: GussetedMesh[] = [{ id: panel, panel, strip: false, ...wall }];
    if (b > 0) meshes.push({ id: `${panel}-STRIP`, panel, strip: true, ...createGrid(xs, [-b, 0], width, dimensions.height) });
    return meshes;
  });
}

/** Writes the posed vertex positions (scene units) and normals of a mesh. */
export function updateGussetedMesh(mesh: GussetedMesh, frame: GussetedFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const out = position.array as Float32Array;
  mesh.samples.forEach((sample, i) => {
    const q = getGussetedPoint(frame.dimensions, mesh.panel, sample, frame.open, frame.gap);
    out[3 * i] = q.x * MM_TO_SCENE;
    out[3 * i + 1] = q.y * MM_TO_SCENE;
    out[3 * i + 2] = q.z * MM_TO_SCENE;
  });
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

/** A polyline on one panel in panel-local mm (drawn as consecutive segments). */
export type GussetedLineSpec = { panel: PanelPosition; points: { x: number; y: number }[] };

const vertical = (panel: PanelPosition, x: number, ys: number[]): GussetedLineSpec => ({
  panel,
  points: ys.map((y) => ({ x, y })),
});
const horizontal = (panel: PanelPosition, y: number, xs: number[]): GussetedLineSpec => ({
  panel,
  points: xs.map((x) => ({ x, y })),
});

/**
 * Lines of the bag: `edges` = the four tube edges (the longitudinal seam lies on the BACK / LEFT one [K], its flap
 * glued inside the gusset, so it adds no line of its own), the top edge, the bottom fold edge and the upper edge of the
 * strip folded onto the BACK (FRONT's strip is the outermost layer there); `creases` = the gusset centre creases.
 */
export function getGussetedLineSpecs(dimensions: Dimensions): { edges: GussetedLineSpec[]; creases: GussetedLineSpec[] } {
  const rows = getWallRows(dimensions);
  const { width: W, depth: D, height: H } = dimensions;
  const b = getBottomFoldDepth(dimensions);
  const edges: GussetedLineSpec[] = [
    vertical('FRONT', 0, rows),
    vertical('FRONT', W, rows),
    vertical('BACK', 0, rows),
    vertical('BACK', W, rows),
    ...WALLS.map((panel) => horizontal(panel, H, getColumns(panel, dimensions))),
    horizontal('FRONT', 0, [0, W]),
  ];
  if (b > 0) edges.push(horizontal('FRONT', -b, [0, W]));
  const creases = (['LEFT', 'RIGHT'] as const).map((panel) => vertical(panel, D / 2, rows));
  return { edges, creases };
}

/** Number of line segments of the specs (buffer size for drei `Line segments`). */
export function countSegments(specs: readonly GussetedLineSpec[]): number {
  return specs.reduce((sum, spec) => sum + Math.max(0, spec.points.length - 1), 0);
}

/** Writes the posed segments (scene units, 6 floats each) into `out`. */
export function writeGussetedLines(specs: readonly GussetedLineSpec[], frame: GussetedFrame, out: Float32Array) {
  let o = 0;
  for (const spec of specs) {
    const posed = spec.points.map((p) => getGussetedPoint(frame.dimensions, spec.panel, p, frame.open, frame.gap));
    for (let i = 0; i < posed.length - 1; i++) {
      for (const q of [posed[i], posed[i + 1]]) {
        out[o++] = q.x * MM_TO_SCENE;
        out[o++] = q.y * MM_TO_SCENE;
        out[o++] = q.z * MM_TO_SCENE;
      }
    }
  }
}
