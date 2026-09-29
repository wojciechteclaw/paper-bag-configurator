// Domain model of a configured paper bag.
// This module must stay framework-free: no React, no Three.js imports.

export type BagType = 'BLOCK' | 'FOLDED';

/** All dimensions are in millimetres. */
export type Dimensions = {
  width: number;
  height: number;
  depth: number;
};

export type HandleType = 'TWISTED_PAPER' | 'FLAT_PAPER';

/**
 * Flat paper strip glued to the inside of the bag wall that anchors the handle.
 * Both handle types in MVP are attached this way.
 */
export type HandlePatch = {
  width: number;
  height: number;
};

/**
 * A handle is an independent entity — a bag either references one or has `null`.
 * Both MVP types are internal handles (glued on the inside of the front/back wall).
 */
export type Handle = {
  id: string;
  type: HandleType;
  color?: string;
  /** Rope diameter (twisted) or strip width (flat), mm. */
  width?: number;
  /** Visible loop length, mm. */
  length?: number;
  patch?: HandlePatch;
};

export type PanelPosition = 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT';

export type Artwork = {
  id: string;
  fileName: string;
  /** Object URL (MVP) or remote URL once uploads hit a backend. */
  fileUrl: string;
  mimeType: string;
  /** Pixel size of the source image. */
  width: number;
  height: number;
  sizeBytes: number;
};

/**
 * How artwork is placed on a panel. MVP only supports FILL (image mapped to the full panel).
 * Reserved for the future positioning module (offset/scale/rotation, cover/contain).
 */
export type ArtworkPlacement = {
  mode: 'FILL';
};

export type BagPanel = {
  id: string;
  position: PanelPosition;
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

export type BagPanels = Record<PanelPosition, BagPanel>;

export type PaperColor = 'WHITE' | 'BROWN';

export type Paper = {
  color: PaperColor;
  /** g/m² */
  grammage: number;
  fscCertified: boolean;
};

export type PrintTechnology = 'FLEXO';

/** Print spec. Pantone codes, e.g. "PMS 186 C"; empty array = unprinted bag. */
export type PrintSpec = {
  technology: PrintTechnology;
  pantoneColors: string[];
};

export type PackagingType = 'CARTON' | 'FOIL';

export type BagConfiguration = {
  id: string;
  productType: BagType;
  dimensions: Dimensions;
  paper: Paper;
  handle: Handle | null;
  panels: BagPanels;
  print: PrintSpec;
  packaging: PackagingType;
  quantity: number;
};
