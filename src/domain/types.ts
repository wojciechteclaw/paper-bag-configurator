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
 * Handle variant of the bag as a product choice: no handle or one of the handle types.
 * Available paper types, grammage range and standard sizes depend on it (`handleVariants` in the catalog).
 * Derived from `BagConfiguration.handle` (`null` → `'NONE'`), never stored separately.
 */
export type HandleVariant = 'NONE' | HandleType;

/** Material of the handle itself. Both MVP handle types are made of strong kraft paper. */
export type HandleMaterial = 'KRAFT';

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
  material: HandleMaterial;
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

/** Artwork rotation in 90° steps (counter-clockwise, seen from outside the bag). */
export type ArtworkRotation = 0 | 90 | 180 | 270;

/**
 * How artwork is placed on a panel (the positioning module, `src/domain/artworkPlacement.ts`).
 * - `FILL` — the image is stretched over the whole visible wall (UV 0..1); the default.
 * - `CUSTOM` — the image keeps its aspect ratio. `scale` is relative to the "contain" fit (1 = the whole image
 *   fits the visible wall, touching two edges), `offsetX` / `offsetY` move the image centre away from the wall
 *   centre in mm (x to the right, y up, panel-local, seen from outside), `rotation` turns it in 90° steps.
 *   Parts outside the wall are clipped by the panel (or, on the dieline, run into the bleed / bottom allowance).
 */
export type ArtworkPlacement =
  | { mode: 'FILL' }
  | {
      mode: 'CUSTOM';
      offsetX: number;
      offsetY: number;
      scale: number;
      rotation: ArtworkRotation;
    };

export type ArtworkPlacementMode = ArtworkPlacement['mode'];

export type BagPanel = {
  id: string;
  position: PanelPosition;
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

export type BagPanels = Record<PanelPosition, BagPanel>;

export type PaperColor = 'WHITE' | 'BROWN';

/**
 * Paper type (independent of colour), after the reference offer:
 * - `KRAFT` — kraft paper (papier kraft; for handle bags: strong / single-ply kraft),
 * - `RECYCLED` — recycled paper (papier z recyklingu),
 * - `COATED` — coated paper (papier kredowany),
 * - `FILM_COATED` — film-laminated paper (papier powlekany folią),
 * - `GREASEPROOF` — greaseproof paper (papier tłuszczoszczelny).
 */
export type PaperType = 'KRAFT' | 'RECYCLED' | 'COATED' | 'FILM_COATED' | 'GREASEPROOF';

export type Paper = {
  type: PaperType;
  color: PaperColor;
  /** g/m² */
  grammage: number;
  fscCertified: boolean;
  /** Moisture barrier. Only `true` when the handle variant allows it (catalog `moistureBarrierAvailable`). */
  moistureBarrier: boolean;
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
