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
 * - `FILL` — the image is stretched over the whole artwork area (by default the visible wall); the default.
 * - `CUSTOM` — the image keeps its aspect ratio. `scale` is relative to the "contain" fit (1 = the whole image
 *   fits the artwork area, touching two edges), `offsetX` / `offsetY` move the image centre away from the area
 *   centre in mm (x to the right, y up, panel-local, seen from outside), `rotation` turns it in 90° steps.
 *   Parts outside the artwork area are clipped (3D: bare paper; dieline: only the bleed / crease overprint).
 *
 * Both modes carry `extendToBottom` ("rozciągnij na dno", docs/SPEC.md §4f). When true, the artwork AREA of the panel
 * is the visible wall plus the bottom allowance a = (D + 30) / 2 below the bottom line: panel-local y ∈ [−a, H]
 * instead of [0, H] (`getPanelArtworkArea`). FILL then stretches over H + a, `scale` / offsets refer to that area,
 * and the artwork also prints on the bottom flap / ears / tuck triangles formed from that allowance.
 */
export type ArtworkPlacement =
  | { mode: 'FILL'; extendToBottom: boolean }
  | {
      mode: 'CUSTOM';
      offsetX: number;
      offsetY: number;
      scale: number;
      rotation: ArtworkRotation;
      extendToBottom: boolean;
    };

export type ArtworkPlacementMode = ArtworkPlacement['mode'];

export type BagPanel = {
  id: string;
  position: PanelPosition;
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

export type BagPanels = Record<PanelPosition, BagPanel>;

/**
 * How artwork is supplied (docs/SPEC.md §3a):
 * - `PER_PANEL` — one artwork per wall (`BagPanel.artwork`); the default.
 * - `WRAP` — whole-bag artwork (`BagConfiguration.wrapLayers`): an ordered list of layers, each laid over the wall
 *   row of the sheet in sheet order LEFT | FRONT | RIGHT | BACK (the glue flap stays unprinted). Panel artwork is
 *   kept but not used.
 */
export type ArtworkLayout = 'PER_PANEL' | 'WRAP';

/**
 * One layer of the whole-bag artwork (docs/SPEC.md §3b). `placement` refers to the WRAP artwork area
 * (`getWrapArtworkArea`): the four walls side by side, (2W + 2D) × H, or with `extendToBottom` (2W + 2D) × (H + a) —
 * the same placement model as a single wall, independent per layer. `id` is stable (reorder, replace, selection).
 */
export type WrapArtworkLayer = {
  id: string;
  artwork: Artwork;
  placement: ArtworkPlacement;
};

/**
 * The single whole-bag artwork slot of data saved before layers existed (30.09.2026). Read through `getWrapLayers`,
 * which migrates it to a one-element layer list (or to none when it held no artwork).
 */
export type LegacyWrapArtwork = {
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

/** Artwork target of one whole-bag layer: `WRAP:<layer id>` (`wrapLayerTarget`, `getWrapLayerId`). */
export type WrapLayerTarget = `WRAP:${string}`;

/** What an artwork (upload, placement edit, dieline selection) belongs to: one wall, or one whole-bag layer. */
export type ArtworkTarget = PanelPosition | WrapLayerTarget;

export type PaperColor = 'WHITE' | 'BROWN';

/**
 * Paper type (independent of colour), after the reference offer:
 * - `KRAFT` — kraft paper (papier kraft; for handle bags: strong / single-ply kraft),
 * - `RECYCLED` — recycled paper (papier z recyklingu),
 * - `COATED` — coated paper (papier kredowany),
 * - `FILM_COATED` — film-laminated paper (papier powlekany folią),
 * - `GREASEPROOF` — greaseproof paper (papier tłuszczoszczelny),
 * - `MG_KRAFT` — machine-glazed kraft (papier kraft MG, one side glossy; gusseted-bag bags, client guideline [K]).
 */
export type PaperType = 'KRAFT' | 'RECYCLED' | 'COATED' | 'FILM_COATED' | 'GREASEPROOF' | 'MG_KRAFT';

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

/**
 * One print colour: the Pantone code (e.g. "PMS 186 C") plus a user-chosen preview colour (`#rrggbb`, lower case).
 * The preview only approximates the Pantone ink on screen; it is used to assign artwork pixels to inks when
 * estimating ink coverage (docs/SPEC.md §4d).
 */
export type PantoneColor = {
  code: string;
  hex: string;
};

/**
 * How the colours detected in the artwork ("Kolory w grafikach", docs/SPEC.md §4d) are grouped. Stored with the
 * configuration so the live table and the PDF / Excel exports use the same values.
 */
export type ColorAnalysisSettings = {
  /** Shades closer than this CIEDE2000 ΔE00 are merged into one colour; 0 = no merging. */
  mergeTolerance: number;
  /** Colours with less than this share (0–1) of the total ink are absorbed into the nearest listed colour or "other". */
  minAreaShare: number;
};

/** Print spec. Empty `pantoneColors` = unprinted bag. */
export type PrintSpec = {
  technology: PrintTechnology;
  pantoneColors: PantoneColor[];
  /** Missing in data saved before 29.09.2026 — read it through `normalizeColorAnalysis`. */
  colorAnalysis: ColorAnalysisSettings;
};

export type PackagingType = 'CARTON' | 'FOIL';

/**
 * Window ("okienko") of the gusseted bag (docs/SPEC.md §2b, docs/PRODUCTION.md §13.6), client decisions [K] 30.09.2026:
 * an opening cut from the paper of the FRONT wall, always centred horizontally on it, closed by a film glued on the
 * inside that overlaps the paper by `filmOverlap` on every closed side of the opening.
 * - `PANORAMIC` — a vertical strip `width` wide from just above the bottom strip d up to the mouth edge (open at the
 *   top: the film ends at the mouth). Its lower edge is derived (`getWindowOpening`): d + filmOverlap + safety margin.
 * - `RECTANGLE` — `width × height`, its lower edge `bottomOffset` above the bottom fold line (the bottom edge of the
 *   finished bag, panel-local y = 0).
 */
export type WindowType = 'PANORAMIC' | 'RECTANGLE';

/** Window film [K]: PP film, perforated PP film (breathing, e.g. bread) or cellulose film. */
export type WindowMaterial = 'PP' | 'PP_PERFORATED' | 'CELLULOSE';

/** All lengths in whole millimetres. */
export type BagWindow =
  | { type: 'PANORAMIC'; material: WindowMaterial; width: number; filmOverlap: number }
  | {
      type: 'RECTANGLE';
      material: WindowMaterial;
      width: number;
      height: number;
      /** Distance from the bottom fold line (bottom edge of the finished bag) to the lower edge of the opening. */
      bottomOffset: number;
      filmOverlap: number;
    };

export type BagConfiguration = {
  id: string;
  productType: BagType;
  dimensions: Dimensions;
  paper: Paper;
  handle: Handle | null;
  panels: BagPanels;
  /** Missing in data saved before 30.09.2026 — read it through `getArtworkLayout` (default `PER_PANEL`). */
  artworkLayout: ArtworkLayout;
  /**
   * Whole-bag artwork layers, bottom → top (later layers print over earlier ones), used when `artworkLayout` is
   * `WRAP`. Missing in older data (which may carry a single `wrapArtwork` instead) — read it through `getWrapLayers`.
   */
  wrapLayers: WrapArtworkLayer[];
  print: PrintSpec;
  packaging: PackagingType;
  /**
   * Width s of the longitudinal glue flap, mm (range per bag type: `BAG_TYPES[type].glueFlap`). Missing in data saved
   * before 30.09.2026 — read it through `getGlueFlapWidth`.
   */
  glueFlapWidth: number;
  /**
   * Bottom strip d of the gusseted bag's fold-over bottom, mm (range: `BAG_TYPES[type].bottomFold`); only for bag
   * types that have one — read it through `getConfiguredBottomFold`.
   */
  bottomFoldDepth?: number;
  /**
   * Window in the FRONT wall (only where `BAG_TYPES[type].windowAvailable`: the gusseted bag), or null (the default).
   * Missing in data saved before 30.09.2026 — read it through `getWindow`.
   */
  window: BagWindow | null;
};
