import { PAPER_PREVIEW_COLORS } from '../domain/config/productCatalog';
import type { BottomPieceId, InnerBottomPieceId } from '../domain/geometry/blockBottom';
import type { PaperColor } from '../domain/types';

/** The only mm → scene-unit conversion factor (1 scene unit = 100 mm). */
export const MM_TO_SCENE = 0.01;

/**
 * Longer side of a wall's layer composite canvas, px (docs/SPEC.md §3b; also capped by the GPU's max texture size).
 * 2048 px over a ~500 mm wall + bottom allowance ≈ 4 px/mm (~100 dpi) — plenty for a preview — at ≤ 16 MB RGBA per
 * wall, so four walls stay well within texture memory.
 */
export const COMPOSITE_MAX_SIDE_PX = 2048;

/**
 * Render-only separation between paper layers when the bag is folded flat, in mm per layer. Paper thickness is not
 * part of the domain; without it every region would be coplanar at 100 % and z-fight (and the faces' polygon offset
 * would let lines of hidden layers show through FRONT, so it must clearly exceed that offset). It fades in over
 * foldProgress 0.85 → 1, so the open and standing bag are geometrically exact (docs/PRODUCTION.md §10.5).
 */
export const PAPER_LAYER_GAP_MM = 1.2;

/**
 * Paper-thickness offset of the glue flap inside LEFT during the assembly from the sheet (docs/PRODUCTION.md §10.8),
 * mm. Render-only; fades in while the tube closes so the flat sheet stays exactly flat.
 */
export const ASSEMBLY_LAYER_GAP_MM = 0.25;

/**
 * Client rule [K]: the bottom layers are offset OUTWARDS (away from the bag interior) from the LEFT / RIGHT side flaps
 * by this much per layer, so their textures never z-fight: side flaps 0, FRONT trapezoid −0.1 mm, BACK trapezoid
 * −0.2 mm (outermost). Render-only; used by the assembly (faded in with the tube, so the sheet stays flat) and by the
 * formed / standing / flat bag. At the default camera distance (7.5 scene units, near 0.1) the depth buffer resolves
 * ~0.003 mm, so the geometric offset alone separates the layers.
 */
export const BOTTOM_LAYER_OFFSET_MM = 0.1;

/**
 * Outward offset of each bottom piece in BOTTOM_LAYER_OFFSET_MM steps (docs/PRODUCTION.md §3.4.2): the corner
 * triangles (ears) sit half a step outside the layer they are tucked under, between the side flap and their trapezoid.
 */
const BOTTOM_LAYER_STEPS: Readonly<Record<BottomPieceId, number>> = {
  SIDE_FLAP_LEFT: 0,
  // Same plane as LEFT's flap. When W < 2E the two flaps overlap in the middle; both inner faces are plain paper, so
  // sharing the plane is invisible, while any smaller-than-a-step offset let the FRONT ears' creases show through
  // (tried: 0.025 mm). The fold model draws only LEFT's edge there (INNER_BOTTOM_STACK tie-break, domain).
  SIDE_FLAP_RIGHT: 0,
  FRONT_EAR_LEFT: 0.5,
  FRONT_EAR_RIGHT: 0.5,
  FRONT_TRAPEZOID: 1,
  BACK_EAR_LEFT: 1.5,
  BACK_EAR_RIGHT: 1.5,
  BACK_TRAPEZOID: 2,
};

/** Outward offset of a bottom piece from the side flaps, mm (≥ 0; FRONT trapezoid 0.1, BACK trapezoid 0.2). */
export function getBottomLayerOffsetMm(id: BottomPieceId): number {
  return BOTTOM_LAYER_STEPS[id] * BOTTOM_LAYER_OFFSET_MM;
}

/**
 * Lines on the bottom underside (trapezoid diagonals, glue seam) float this far off the side flaps' outer surface —
 * beyond the outermost layer (BACK trapezoid, 2 · BOTTOM_LAYER_OFFSET_MM) — so they are visible from below but hidden
 * when looking into the bag through the open top. Render-only, mm.
 */
export const BOTTOM_LINE_LIFT_MM = 0.3;

/**
 * Depth of the ContactShadows plane below the floor (y = 0), mm: under every bottom layer (≤ 0.2 mm) and the underside
 * lines (0.3 mm), so the shadow never draws over the bottom seen through the open top. Render-only.
 */
export const CONTACT_SHADOW_DEPTH_MM = 0.5;

/**
 * Outward offset (mm) of any piece of the bottom stack seen from inside (`INNER_BOTTOM_STACK`): the bottom pieces as
 * `getBottomLayerOffsetMm`, the glue flap's zone part half a step INSIDE LEFT's side flap (−0.05 mm, as in the assembly).
 */
export function getInnerBottomLayerOffsetMm(id: InnerBottomPieceId): number {
  return id === 'GLUE_FLAP' ? -BOTTOM_LAYER_OFFSET_MM / 2 : getBottomLayerOffsetMm(id);
}

/**
 * Lines on the INSIDE of the bottom (paper edges of the innermost layers: side flaps, glue flap, trapezoid end) float
 * this far inside the face they are drawn on, so they are visible through the open top but hidden from below by the
 * outer layers (≥ 0.1 mm further out). Render-only, mm; half a layer step (client limit ≤ 0.1 mm per step).
 */
export const BOTTOM_INNER_LINE_LIFT_MM = BOTTOM_LAYER_OFFSET_MM / 2;

export type PaperPalette = {
  /** Base colour of panels without artwork (and of all inner surfaces). */
  paper: string;
  /** Panel boundary lines (same role as drei `Edges`). */
  edge: string;
  /** Crease (bigowanie) lines — subtler than edges. */
  crease: string;
};

/** Single source of paper colours in the 3D preview. */
export const PAPER_PALETTES: Record<PaperColor, PaperPalette> = {
  WHITE: { paper: PAPER_PREVIEW_COLORS.WHITE, edge: '#8c887e', crease: '#a39f95' },
  BROWN: { paper: PAPER_PREVIEW_COLORS.BROWN, edge: '#6e5436', crease: '#7d6040' },
};
