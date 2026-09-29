import type { PaperColor } from '../domain/types';

/** The only mm → scene-unit conversion factor (1 scene unit = 100 mm). */
export const MM_TO_SCENE = 0.01;

/**
 * Render-only separation between paper layers when the bag is folded flat, in mm. Paper thickness is not part of
 * the domain; without this the front wall, both gusset halves and the back wall would be coplanar at 100 % and
 * z-fight. It scales with sin θ, so the open bag (0 %) is geometrically exact.
 */
export const PAPER_LAYER_GAP_MM = 0.5;

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
  WHITE: { paper: '#f4f2ec', edge: '#8c887e', crease: '#a39f95' },
  BROWN: { paper: '#b88a5a', edge: '#6e5436', crease: '#7d6040' },
};
