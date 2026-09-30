// Procedural geometry of the gusseted-bag bag with a fold-over bottom (FOLDED). Kept apart from the block-bottom
// bagGeometry / assemblyGeometry: the shape comes from `gussetedPosePoint` (src/domain/geometry/gussetedAssembly.ts:
// the forming from the sheet, then the gusseted model of gussetedBag.ts — open bag and its fold), this module only
// samples it into three.js buffers (mm → scene units here, nowhere else).
//
// Meshes: the four walls (FRONT, BACK, gussets LEFT / RIGHT) above the bottom fold line, each a grid in its own
// panel-local mm with UV = (x / panel width, y / H) — the same UV basis as the block bottom, so the shared
// `computePanelUvTransform` places artwork identically in 2D and 3D — plus the fold-over strip of every wall
// (y ∈ [−b, 0]) folded onto the BACK [K], and the seam flap (u ∈ [0, s], unprinted; glued inside LB once the tube is
// formed). The same grids serve every phase: the gusset grids have a column on the centre crease, so the gusset halves
// move as rigid links while the tube forms.
//
// Film window (docs/SPEC.md §2b): FRONT's grid gets columns / rows on the opening edges and leaves the opening's cells
// out (a real hole in both the outer and the inner face, so the interior shows through and the artwork is masked), and
// a separate film mesh fills the opening in FRONT's surface (posed with the same kinematics: open, folded, between).

import { BufferAttribute, BufferGeometry } from 'three';
import {
  getGussetedFlapWidth,
  getGussetedPose,
  gussetedPosePoint,
  type GussetedPose,
  type GussetedSheetPart,
} from '../domain/geometry/gussetedAssembly';
import { getBottomFoldDepth, getGussetOpeningRise, type GussetedDimensions } from '../domain/geometry/gussetedBag';
import { getPanelSize } from '../domain/panels';
import type { BagWindow, Dimensions, PanelPosition } from '../domain/types';
import { getWindowFilm, getWindowOpening, isInWindowOpening, type WindowOpening } from '../domain/window';
import { MM_TO_SCENE, WINDOW_FILM_INSET_MM } from './constants';

/** Render-only paper-layer separation of the flat parts (folded bag, glued bottom), mm. */
export const GUSSETED_LAYER_GAP_MM = 0.4;

const WALLS: readonly PanelPosition[] = ['FRONT', 'RIGHT', 'BACK', 'LEFT'];
/** Rows across the opening zone (where the gussets turn), columns across a gusset (even: the centre crease is a column). */
const OPENING_ROWS = 24;
const GUSSET_COLUMNS = 8;

export type GussetedMesh = {
  /** Wall, `GLUE` (seam flap), `<part>-STRIP` for the fold-over bottom strip, or `WINDOW-FILM` (on FRONT). */
  id: string;
  /** Sheet part whose kinematics the mesh follows. */
  part: GussetedSheetPart;
  /** Wall whose artwork the mesh shows (the seam flap: none — `glue`). */
  panel: PanelPosition;
  /** The unprinted seam flap. */
  glue?: boolean;
  strip: boolean;
  /** The window film: UV = (0..1) over the opening, drawn with the film material. */
  film?: boolean;
  geometry: BufferGeometry;
  /** Panel-local mm of every vertex, in buffer order. */
  samples: { x: number; y: number }[];
};

export type GussetedFrame = { pose: GussetedPose };

/**
 * One pose of the gusseted timeline (`getGussetedPose`): forming progress q (sheet → open bag) and, at q = 1, the fold
 * progress p (open → flat), with the render layer gap.
 */
export function getGussetedFrame(
  dimensions: GussetedDimensions,
  glueFlapWidth: number,
  assemblyProgress: number,
  foldProgress: number,
  gap = GUSSETED_LAYER_GAP_MM,
): GussetedFrame {
  return { pose: getGussetedPose(dimensions, glueFlapWidth, assemblyProgress, foldProgress, gap) };
}

/**
 * Heights of the wall rows: dense where the gussets turn (b … b + y_r), sparse above (the shape is linear in y), plus
 * `extra` rows (the window's edges).
 */
export function getWallRows(dimensions: Dimensions, extra: readonly number[] = []): number[] {
  const H = dimensions.height;
  const b = getBottomFoldDepth(dimensions);
  const rise = getGussetOpeningRise(dimensions);
  const rows = new Set<number>([0, b, H]);
  for (let i = 0; i <= OPENING_ROWS; i++) rows.add(Math.min(H, b + (rise * i) / OPENING_ROWS));
  const top = b + rise;
  for (let i = 1; i < 4; i++) rows.add(top + ((H - top) * i) / 4);
  for (const y of extra) rows.add(y);
  return [...rows].filter((y) => y >= 0 && y <= H).sort((p, q) => p - q);
}

function getColumns(panel: PanelPosition, dimensions: Dimensions, opening: WindowOpening | null = null): number[] {
  const { width } = getPanelSize(panel, dimensions);
  const count = panel === 'LEFT' || panel === 'RIGHT' ? GUSSET_COLUMNS : 2;
  const xs = Array.from({ length: count + 1 }, (_, i) => (width * i) / count);
  if (opening && panel === 'FRONT') xs.push(opening.x, opening.x + opening.width);
  return [...new Set(xs)].sort((p, q) => p - q);
}

/** The window opening on FRONT (panel-local mm), or null. */
export function getFrontOpening(dimensions: Dimensions, window: BagWindow | null): WindowOpening | null {
  if (!window) return null;
  const opening = getWindowOpening(window, dimensions);
  return opening.width > 0 && opening.height > 0 ? opening : null;
}

/** Window edge heights (rows of FRONT's grid and of the lines). */
const openingRows = (opening: WindowOpening | null) => (opening ? [opening.y, opening.y + opening.height] : []);

function createGrid(
  xs: number[],
  ys: number[],
  uvOf: (x: number, y: number) => [number, number],
  /** Cells whose centre makes this true are left out (the window opening). */
  skip?: (x: number, y: number) => boolean,
) {
  const samples = ys.flatMap((y) => xs.map((x) => ({ x, y })));
  const uv = new Float32Array(samples.length * 2);
  samples.forEach(({ x, y }, i) => {
    [uv[2 * i], uv[2 * i + 1]] = uvOf(x, y);
  });
  const index: number[] = [];
  const stride = xs.length;
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      if (skip?.((xs[c] + xs[c + 1]) / 2, (ys[r] + ys[r + 1]) / 2)) continue;
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

/**
 * One mesh per wall and per fold strip, plus the window film when there is a window (FRONT then has a hole);
 * positions are written by `updateGussetedMesh`.
 */
export function createGussetedMeshes(dimensions: Dimensions, window: BagWindow | null = null, glueFlapWidth = 0): GussetedMesh[] {
  const opening = getFrontOpening(dimensions, window);
  const rows = getWallRows(dimensions, openingRows(opening));
  const b = getBottomFoldDepth(dimensions);
  const H = dimensions.height;
  const meshes = WALLS.flatMap((panel): GussetedMesh[] => {
    const { width } = getPanelSize(panel, dimensions);
    const xs = getColumns(panel, dimensions, opening);
    const panelUv = (x: number, y: number): [number, number] => [width > 0 ? x / width : 0, H > 0 ? y / H : 0];
    const hole = opening && panel === 'FRONT' ? (x: number, y: number) => isInWindowOpening(opening, x, y) : undefined;
    const wall = createGrid(xs, rows, panelUv, hole);
    const result: GussetedMesh[] = [{ id: panel, part: panel, panel, strip: false, ...wall }];
    if (b > 0) result.push({ id: `${panel}-STRIP`, part: panel, panel, strip: true, ...createGrid(xs, [-b, 0], panelUv) });
    return result;
  });
  const s = getGussetedFlapWidth(dimensions, glueFlapWidth);
  if (s > 0) {
    // Seam flap: unprinted paper, laid on LB (LEFT x = u) — the same rows, so it follows LB's shape when open.
    const none = (): [number, number] => [0, 0];
    meshes.push({ id: 'GLUE', part: 'GLUE', panel: 'LEFT', glue: true, strip: false, ...createGrid([0, s], rows, none) });
    if (b > 0) meshes.push({ id: 'GLUE-STRIP', part: 'GLUE', panel: 'LEFT', glue: true, strip: true, ...createGrid([0, s], [-b, 0], none) });
  }
  if (opening && window) {
    // The film is glued on the INSIDE of FRONT and overlaps the paper around the opening by the film overlap (client
    // [K]): its mesh covers the film rectangle (opening + overlap on every closed side) and is posed just inside FRONT.
    const { x, y, width: w, height: h } = getWindowFilm(window, dimensions);
    const filmRows = [...new Set([y, ...rows.filter((r) => r > y && r < y + h), y + h])].sort((p, q) => p - q);
    const film = createGrid([x, x + w / 2, x + w], filmRows, (px, py) => [(px - x) / w, (py - y) / h]);
    meshes.push({ id: 'WINDOW-FILM', part: 'FRONT', panel: 'FRONT', strip: false, film: true, ...film });
  }
  return meshes;
}

/** Scene-space position of a sheet point (pose, then the view shift of the forming: sheet centre, strip lift). */
function writePoint(frame: GussetedFrame, part: GussetedSheetPart, x: number, y: number, out: Float32Array, o: number) {
  const { pose } = frame;
  const q = gussetedPosePoint(pose, part, x, y);
  out[o] = (q.x - pose.view.centreX) * MM_TO_SCENE;
  out[o + 1] = (q.y + pose.view.lift) * MM_TO_SCENE;
  out[o + 2] = q.z * MM_TO_SCENE;
}

/** Writes the posed vertex positions (scene units) and normals of a mesh. */
export function updateGussetedMesh(mesh: GussetedMesh, frame: GussetedFrame) {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  const out = position.array as Float32Array;
  mesh.samples.forEach((sample, i) => writePoint(frame, mesh.part, sample.x, sample.y, out, 3 * i));
  if (mesh.film) {
    // Pose the film just inside FRONT (against its unprinted face): shift along the outward normal, inwards.
    mesh.geometry.computeVertexNormals();
    const normal = mesh.geometry.getAttribute('normal') as BufferAttribute;
    const inset = WINDOW_FILM_INSET_MM * MM_TO_SCENE;
    for (let i = 0; i < mesh.samples.length; i++) {
      out[3 * i] -= normal.getX(i) * inset;
      out[3 * i + 1] -= normal.getY(i) * inset;
      out[3 * i + 2] -= normal.getZ(i) * inset;
    }
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

/** A polyline on one sheet part in panel-local mm (drawn as consecutive segments). */
export type GussetedLineSpec = { panel: GussetedSheetPart; points: { x: number; y: number }[] };

const vertical = (panel: GussetedSheetPart, x: number, ys: number[]): GussetedLineSpec => ({
  panel,
  points: ys.map((y) => ({ x, y })),
});
const horizontal = (panel: GussetedSheetPart, y: number, xs: number[]): GussetedLineSpec => ({
  panel,
  points: xs.map((x) => ({ x, y })),
});

/**
 * Lines of the bag: `edges` = the four tube edges (the longitudinal seam lies on the BACK / LEFT one [K], its flap
 * glued inside the gusset, so it adds no line of its own), the top edge, the bottom fold edge and the upper edge of the
 * strip folded onto the BACK (FRONT's strip is the outermost layer there); `creases` = the gusset centre creases. For
 * the flat sheet and the forming they also carry the rest of the cut outline (LB's free edge, the strip ends, the seam
 * flap) and the bottom line of every wall.
 */
export function getGussetedLineSpecs(
  dimensions: Dimensions,
  window: BagWindow | null = null,
  glueFlapWidth = 0,
): { edges: GussetedLineSpec[]; creases: GussetedLineSpec[] } {
  const opening = getFrontOpening(dimensions, window);
  const rows = getWallRows(dimensions, openingRows(opening));
  const { width: W, depth: D, height: H } = dimensions;
  const b = getBottomFoldDepth(dimensions);
  const edges: GussetedLineSpec[] = [
    vertical('FRONT', 0, rows),
    vertical('FRONT', W, rows),
    vertical('BACK', 0, rows),
    vertical('BACK', W, rows),
    // Mouth edge; a panoramic window interrupts FRONT's (the film ends at the mouth).
    ...WALLS.flatMap((panel) =>
      panel === 'FRONT' && opening?.openAtTop
        ? [horizontal(panel, H, [0, opening.x]), horizontal(panel, H, [opening.x + opening.width, W])]
        : [horizontal(panel, H, getColumns(panel, dimensions))],
    ),
    horizontal('FRONT', 0, [0, W]),
  ];
  // Cut edges of the window opening (the panoramic strip is open at the mouth: no top edge of its own).
  if (opening) {
    const { x, y, width: w, height: h } = opening;
    const side = rows.filter((r) => r >= y && r <= y + h);
    edges.push(vertical('FRONT', x, side), vertical('FRONT', x + w, side), horizontal('FRONT', y, [x, x + w]));
    if (!opening.openAtTop) edges.push(horizontal('FRONT', y + h, [x, x + w]));
  }
  if (b > 0) edges.push(horizontal('FRONT', -b, [0, W]));
  // Sheet outline and bottom lines (hidden under other layers once the bag is formed): LB's free edge (the sheet's
  // left cut edge), the bottom line C1 and the strip end of the other walls, and the seam flap's outline.
  edges.push(vertical('LEFT', 0, [-b, ...rows]));
  for (const panel of ['RIGHT', 'BACK', 'LEFT'] as const) {
    edges.push(horizontal(panel, 0, getColumns(panel, dimensions)));
    if (b > 0) edges.push(horizontal(panel, -b, getColumns(panel, dimensions)));
  }
  const s = getGussetedFlapWidth(dimensions, glueFlapWidth);
  if (s > 0) {
    edges.push(vertical('GLUE', s, b > 0 ? [-b, ...rows] : rows), horizontal('GLUE', H, [0, s]));
    if (b > 0) edges.push(horizontal('GLUE', -b, [0, s]));
  }
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
    for (let i = 0; i < spec.points.length - 1; i++) {
      for (const q of [spec.points[i], spec.points[i + 1]]) {
        writePoint(frame, spec.panel, q.x, q.y, out, o);
        o += 3;
      }
    }
  }
}

/** Extent of the flat sheet for the camera fit, mm: bounding radius and centre height above the floor. */
export function getGussetedSheetViewExtent(dimensions: GussetedDimensions, glueFlapWidth: number): { radius: number; centreY: number } {
  const { width: W, depth: F, height: H } = dimensions;
  const width = 2 * W + 2 * F + getGussetedFlapWidth(dimensions, glueFlapWidth);
  const height = H + getBottomFoldDepth(dimensions);
  return { radius: 0.5 * Math.hypot(width, height), centreY: height / 2 };
}
