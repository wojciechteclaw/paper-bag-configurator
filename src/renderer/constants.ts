import { PAPER_PREVIEW_COLORS } from '../domain/config/productCatalog';
import type { PaperColor } from '../domain/types';

/** The only mm → scene-unit conversion factor (1 scene unit = 100 mm). */
export const MM_TO_SCENE = 0.01;

/**
 * Render-only separation between paper layers when the bag is folded flat, in mm per layer. Paper thickness is not
 * part of the domain; without it every region would be coplanar at 100 % and z-fight (and the faces' polygon offset
 * would let lines of hidden layers show through FRONT, so it must clearly exceed that offset). It fades in over
 * foldProgress 0.85 → 1, so the open and standing bag are geometrically exact (docs/PRODUCTION.md §10.5).
 */
export const PAPER_LAYER_GAP_MM = 1.2;

/**
 * Paper-thickness offset per layer during the assembly from the sheet (docs/PRODUCTION.md §10.8), mm: the glue flap
 * inside LEFT, and the formed bottom (BACK flap outermost, then glue-flap ear, back ears, FRONT flap, front ears,
 * side triangles). Render-only; fades in while the tube closes so the flat sheet stays exactly flat.
 */
export const ASSEMBLY_LAYER_GAP_MM = 0.25;

/**
 * Lines on the bottom underside (flap seam, tuck diagonals…) float this far off the outer surface so they are
 * visible from below but hidden when looking into the bag through the open top. Render-only, mm.
 */
export const BOTTOM_LINE_LIFT_MM = 0.3;

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
