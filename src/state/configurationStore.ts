import { create } from 'zustand';
import {
  alignPlacement,
  DEFAULT_PLACEMENT,
  fillPlacement,
  normalizePlacement,
  setPlacementExtendToBottom,
  type ArtworkAlignment,
} from '../domain/artworkPlacement';
import {
  getArtworkLayout,
  getArtworkSlot,
  getArtworkTargetArea,
  getLayers,
  getLayerTargetInfo,
  getNewLayerPlacement,
  getSheetLayers,
  getWrapLayers,
} from '../domain/artworkLayout';
import { ARTWORK_LAYOUTS, BAG_TYPES, MAX_WRAP_ARTWORK_LAYERS, WINDOW_RULES } from '../domain/config/productCatalog';
import { constrainDimension, constrainDimensions, constrainGrammage } from '../domain/constraints';
import { createConfiguration, createHandle, createWrapLayer } from '../domain/factories';
import { constrainGlueFlapWidth, getGlueFlapWidth } from '../domain/glueFlap';
import { constrainBottomFold, getConfiguredBottomFold } from '../domain/bottomFold';
import {
  constrainPaperToVariant,
  getHandleVariantDefinition,
  getStandardSizeViolations,
  getSupportedHandleTypes,
  type PaperAdjustment,
} from '../domain/handleVariants';
import { suggestPantonePreviewHex } from '../domain/printColors';
import { collectArtworks } from '../domain/project/artworkRefs';
import { normalizeHex } from '../domain/printCoverage/color';
import { normalizeColorAnalysis } from '../domain/printCoverage/colorAnalysis';
import type {
  Artwork,
  ArtworkLayout,
  ArtworkPlacement,
  ArtworkTarget,
  BagConfiguration,
  BagType,
  ColorAnalysisSettings,
  Dimensions,
  HandleType,
  LayeredArtworkLayout,
  PackagingType,
  PanelPosition,
  PaperColor,
  PaperType,
  WindowMaterial,
  WindowType,
} from '../domain/types';
import { normalizePantoneCode, validatePantoneColorToAdd, type PantoneError } from '../domain/validation/production';
import { changeProductType, type ProductTypeAdjustment } from '../domain/productType';
import { constrainWindow, createWindow, getWindow, getWindowDimensions, type WindowField } from '../domain/window';

// Single source of truth for the configuration. The 3D renderer only reads from here.
// Every action produces a valid BagConfiguration: invalid input is constrained or ignored, never stored.
type ConfigurationState = {
  configuration: BagConfiguration;
  /**
   * Replaces the whole configuration (loading a project, docs/SPEC.md §4h). The caller passes a configuration already
   * made valid (`sanitizeConfiguration`). Object URLs of the previous artwork that the new configuration does not use
   * are revoked.
   */
  replaceConfiguration: (configuration: BagConfiguration) => void;
  /**
   * Switches the bag type, keeping the configuration where the new type allows it (`changeProductType`: unsupported
   * handle removed, dimensions / paper / options constrained, artwork kept). Unavailable types and re-selecting the
   * current type are ignored. Returns what had to be adjusted so the UI can tell the user.
   */
  setProductType: (type: BagType) => ProductTypeAdjustment[];
  /** Starts over with a new default configuration of `type` (artwork object URLs are revoked). Unavailable types are ignored. */
  resetConfiguration: (type: BagType) => void;
  /** Clamps into the effective limits (depth ≤ width) and snaps to the 5 mm step. */
  setDimension: (key: keyof Dimensions, value: number) => void;
  /** Glue flap width s, mm; clamped into the bag type's range (`BAG_TYPES[type].glueFlap`). */
  setGlueFlapWidth: (value: number) => void;
  /** Bottom strip d (gusseted bag), mm; clamped into the bag type's range; ignored for types without one. */
  setBottomFoldDepth: (value: number) => void;
  /**
   * Applies a standard size of the current handle variant. Sizes outside the dimension limits are ignored
   * (never silently clamped into a different size). Returns whether the size was applied.
   */
  applyStandardSize: (sizeId: string) => boolean;
  /** Ignored when the type is not allowed for the current handle variant. */
  setPaperType: (type: PaperType) => void;
  setPaperColor: (color: PaperColor) => void;
  /** Clamped into the current handle variant's range and snapped to its step. */
  setGrammage: (grammage: number) => void;
  setFscCertified: (fscCertified: boolean) => void;
  /** Enabling is ignored when the current handle variant does not offer a moisture barrier. */
  setMoistureBarrier: (moistureBarrier: boolean) => void;
  /**
   * Sets the handle variant and constrains the paper into the new variant's options.
   * Returns what had to be adjusted (empty when nothing changed) so the UI can tell the user.
   */
  setHandle: (type: HandleType | null) => PaperAdjustment[];
  /**
   * Per-wall artwork or one whole-bag (wrap) artwork (docs/SPEC.md §3a). Switching keeps the artwork of the other
   * layout (it is just not used), so switching back restores it. Unknown layouts are ignored.
   */
  setArtworkLayout: (layout: ArtworkLayout) => void;
  /**
   * Replaces or removes the artwork of a wall or of a whole-bag layer (`WRAP:<id>`); the previous object URL is
   * revoked. Wall: the placement resets to FILL; new and removed artwork get `ARTWORK_EXTEND_TO_BOTTOM_DEFAULT`, a
   * replaced image keeps the wall's "extend to bottom". Layer: `null` removes the layer; a replaced image keeps the
   * layer's id, position in the stack and placement (a placed logo stays where it is). Unknown layers are ignored.
   */
  setPanelArtwork: (target: ArtworkTarget, artwork: Artwork | null) => void;
  /**
   * Adds a whole-bag layer on top of the others (docs/SPEC.md §3b). The first layer FILLs the wall row, later ones
   * start fitted on the FRONT wall (`getNewWrapLayerPlacement`). Returns the new layer's id, or null when
   * `MAX_WRAP_ARTWORK_LAYERS` is reached (the artwork's object URL is then revoked).
   */
  addWrapLayer: (artwork: Artwork) => string | null;
  /** Removes a whole-bag layer and revokes its object URL. Unknown ids are ignored. */
  removeWrapLayer: (layerId: string) => void;
  /** Moves a whole-bag layer one step up (+1: printed later, on top) or down (−1); ignored at either end. */
  moveWrapLayer: (layerId: string, direction: 1 | -1) => void;
  /**
   * Adds a layer on top of a layered layout (whole bag `WRAP`, docs/SPEC.md §3b, or whole sheet `SHEET`, §3c). The
   * first layer FILLs the area, later ones start fitted on the FRONT wall (`getNewLayerPlacement`). Returns the new
   * layer's id, or null when `MAX_WRAP_ARTWORK_LAYERS` is reached (the artwork's object URL is then revoked).
   */
  addArtworkLayer: (layout: LayeredArtworkLayout, artwork: Artwork) => string | null;
  /** Removes a layer of a layered layout and revokes its object URL. Unknown ids are ignored. */
  removeArtworkLayer: (layout: LayeredArtworkLayout, layerId: string) => void;
  /** Moves a layer one step up (+1: printed later, on top) or down (−1); ignored at either end. */
  moveArtworkLayer: (layout: LayeredArtworkLayout, layerId: string, direction: 1 | -1) => void;
  /** Sets how the artwork sits on its target (normalized against its artwork area: scale limits, centre kept inside, 90° steps). */
  setPanelPlacement: (target: ArtworkTarget, placement: ArtworkPlacement) => void;
  /** Back to the default placement (`DEFAULT_PLACEMENT`: FILL, extension per `ARTWORK_EXTEND_TO_BOTTOM_DEFAULT`). */
  resetPanelPlacement: (target: ArtworkTarget) => void;
  /** FILL over the current artwork area (keeps "extend to bottom"). */
  fillPanelPlacement: (target: ArtworkTarget) => void;
  /** Aligns the artwork to an edge / the centre of its artwork area (FILL becomes contain first). Needs artwork. */
  alignPanelArtwork: (target: ArtworkTarget, alignment: ArtworkAlignment) => void;
  /**
   * "Rozciągnij na dno": extends the target's artwork area by the bottom allowance (docs/SPEC.md §4f; for the wrap:
   * under all four walls). A CUSTOM image stays where it is; FILL re-stretches over the new area.
   */
  setPanelExtendToBottom: (target: ArtworkTarget, extendToBottom: boolean) => void;
  /**
   * Adds a Pantone entry with a preview colour (`hex`; when omitted, a suggestion for the code is used).
   * Returns the validation error, or null when the colour was added.
   */
  addPantoneColor: (code: string, hex?: string) => PantoneError | null;
  /** Changes the preview colour of an entry; invalid hex values are ignored. */
  setPantoneColorHex: (index: number, hex: string) => void;
  removePantoneColor: (index: number) => void;
  /** Colour-analysis settings of the artwork palette (merge tolerance, minimum share); values are clamped. */
  setColorAnalysis: (patch: Partial<ColorAnalysisSettings>) => void;
  setPackaging: (packaging: PackagingType) => void;
  /**
   * Window in the FRONT wall (docs/SPEC.md §2b): null removes it; a type creates it (`createWindow`, defaults [Z]) or
   * switches panoramic ↔ rectangle keeping material, overlap and width. Ignored for bag types without windows.
   */
  setWindowType: (type: WindowType | null) => void;
  /** Film material; unknown materials and a missing window are ignored. */
  setWindowMaterial: (material: WindowMaterial) => void;
  /**
   * One numeric window value, mm; the window is constrained into its limits afterwards (`constrainWindow` — a larger
   * overlap may shrink / move the opening). Non-finite values keep the stored value; no window → ignored.
   */
  setWindowValue: (field: WindowField, value: number) => void;
};

/** The window re-constrained for new dimensions (patch; empty without a window). */
function windowFor(configuration: BagConfiguration, patch: Partial<BagConfiguration>): Partial<BagConfiguration> {
  const window = getWindow(configuration);
  return window ? { window: constrainWindow(window, getWindowDimensions({ ...configuration, ...patch })) } : {};
}

function revokeArtworkUrl(artwork: Artwork | null) {
  if (artwork?.fileUrl.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(artwork.fileUrl);
  }
}

/** The configuration field holding the layers of a layered layout. */
const layerField = (layout: LayeredArtworkLayout) => (layout === 'SHEET' ? 'sheetLayers' : 'wrapLayers');

/**
 * Configuration patch writing (part of) the artwork slot of a wall or of a layer. A layer's artwork is never null
 * (removing a layer is `removeArtworkLayer`); an unknown layer yields no change.
 */
function writeSlot(
  configuration: BagConfiguration,
  target: ArtworkTarget,
  slot: Partial<{ artwork: Artwork; placement: ArtworkPlacement }> | Partial<{ artwork: Artwork | null; placement: ArtworkPlacement }>,
): Partial<BagConfiguration> {
  const info = getLayerTargetInfo(target);
  if (info?.layout === 'SHEET') {
    // Whole-sheet layers always print the bottom allowance / strip: it is part of the sheet (docs/SPEC.md §3c).
    if (slot.placement && !slot.placement.extendToBottom) slot = { ...slot, placement: { ...slot.placement, extendToBottom: true } };
  } else if (slot.placement?.extendToBottom && !BAG_TYPES[configuration.productType].extendToBottomAvailable) {
    // Bag types without a printed bottom allowance (gusseted-bag bag) never store "extend to bottom".
    slot = { ...slot, placement: { ...slot.placement, extendToBottom: false } };
  }
  if (info !== null) {
    const layers = getLayers(configuration, info.layout);
    if (!layers.some((layer) => layer.id === info.layerId) || slot.artwork === null) return {};
    return {
      [layerField(info.layout)]: layers.map((layer) =>
        layer.id === info.layerId ? { ...layer, ...(slot as Partial<{ artwork: Artwork; placement: ArtworkPlacement }>) } : layer,
      ),
    };
  }
  const { panels } = configuration;
  const position = target as PanelPosition;
  return { panels: { ...panels, [position]: { ...panels[position], ...slot } } };
}

export const useConfigurationStore = create<ConfigurationState>((set, get) => {
  const update = (patch: (configuration: BagConfiguration) => Partial<BagConfiguration>) =>
    set(({ configuration }) => ({ configuration: { ...configuration, ...patch(configuration) } }));
  const definitionOf = (configuration: BagConfiguration) => BAG_TYPES[configuration.productType];
  const variantOf = (configuration: BagConfiguration) =>
    getHandleVariantDefinition(definitionOf(configuration), configuration.handle);

  return {
    configuration: createConfiguration('BLOCK'),

    replaceConfiguration: (next) => {
      const kept = new Set(collectArtworks(next).map((artwork) => artwork.fileUrl));
      collectArtworks(get().configuration).forEach((artwork) => {
        if (!kept.has(artwork.fileUrl)) revokeArtworkUrl(artwork);
      });
      set({ configuration: next });
    },

    setProductType: (type) => {
      const { configuration } = get();
      if (type === configuration.productType || !BAG_TYPES[type]?.available) return [];
      const next = changeProductType(configuration, type);
      set({ configuration: next.configuration });
      return next.adjustments;
    },

    resetConfiguration: (type) => {
      if (!BAG_TYPES[type]?.available) return;
      const { configuration } = get();
      Object.values(configuration.panels).forEach((panel) => revokeArtworkUrl(panel.artwork));
      getWrapLayers(configuration).forEach((layer) => revokeArtworkUrl(layer.artwork));
      getSheetLayers(configuration).forEach((layer) => revokeArtworkUrl(layer.artwork));
      set({ configuration: createConfiguration(type) });
    },

    setDimension: (key, value) =>
      update((c) => {
        const { dimensions, productType } = c;
        const next = { ...dimensions, [key]: constrainDimension(key, value, dimensions, BAG_TYPES[productType].limits) };
        return { dimensions: next, ...windowFor(c, { dimensions: next }) };
      }),

    setGlueFlapWidth: (value) =>
      update((c) => ({ glueFlapWidth: constrainGlueFlapWidth(value, c.productType, getGlueFlapWidth(c)) })),

    setBottomFoldDepth: (value) =>
      update((c) => {
        const next = constrainBottomFold(value, c.productType, getConfiguredBottomFold(c));
        return next === undefined ? {} : { bottomFoldDepth: next, ...windowFor(c, { bottomFoldDepth: next }) };
      }),

    applyStandardSize: (sizeId) => {
      const { configuration } = get();
      const { limits } = definitionOf(configuration);
      const standardSize = variantOf(configuration).standardSizes.find((s) => s.id === sizeId);
      if (!standardSize || getStandardSizeViolations(standardSize, limits).length > 0) return false;
      update((c) => {
        const next = constrainDimensions(standardSize.dimensions, c.dimensions, limits);
        return { dimensions: next, ...windowFor(c, { dimensions: next }) };
      });
      return true;
    },

    setPaperType: (type) =>
      update((c) => (variantOf(c).paperTypes.includes(type) ? { paper: { ...c.paper, type } } : {})),

    setPaperColor: (color) =>
      update((c) => (definitionOf(c).paperColors.includes(color) ? { paper: { ...c.paper, color } } : {})),

    setGrammage: (grammage) =>
      update((c) => ({
        paper: { ...c.paper, grammage: constrainGrammage(grammage, variantOf(c).grammage, c.paper.grammage) },
      })),

    setFscCertified: (fscCertified) => update((c) => ({ paper: { ...c.paper, fscCertified } })),

    setMoistureBarrier: (moistureBarrier) =>
      update((c) =>
        moistureBarrier && !variantOf(c).moistureBarrierAvailable ? {} : { paper: { ...c.paper, moistureBarrier } },
      ),

    setHandle: (type) => {
      const { configuration } = get();
      if ((configuration.handle?.type ?? null) === type) return [];
      if (type !== null && !getSupportedHandleTypes(definitionOf(configuration)).includes(type)) return [];
      const handle = type === null ? null : createHandle(type);
      const { paper, adjustments } = constrainPaperToVariant(
        configuration.paper,
        getHandleVariantDefinition(definitionOf(configuration), handle),
      );
      update(() => ({ handle, paper }));
      return adjustments;
    },

    setArtworkLayout: (layout) =>
      update((c) => (ARTWORK_LAYOUTS.includes(layout) && getArtworkLayout(c) !== layout ? { artworkLayout: layout } : {})),

    setPanelArtwork: (target, artwork) => {
      const info = getLayerTargetInfo(target);
      if (info !== null) {
        if (!artwork) {
          get().removeArtworkLayer(info.layout, info.layerId);
          return;
        }
        const { configuration } = get();
        const { artwork: previous, placement } = getArtworkSlot(configuration, target);
        if (!previous) return;
        if (previous.fileUrl !== artwork.fileUrl) revokeArtworkUrl(previous);
        const area = getArtworkTargetArea(target, configuration, placement);
        update((c) => writeSlot(c, target, { artwork, placement: normalizePlacement(placement, area) }));
        return;
      }
      const { artwork: previous, placement: current } = getArtworkSlot(get().configuration, target);
      if (previous && previous.fileUrl !== artwork?.fileUrl) revokeArtworkUrl(previous);
      const placement = !artwork || !previous
        ? DEFAULT_PLACEMENT
        : artwork.id === previous?.id
          ? current
          : fillPlacement(current.extendToBottom === true);
      update((c) => writeSlot(c, target, { artwork, placement }));
    },

    addArtworkLayer: (layout, artwork) => {
      const { configuration } = get();
      const layers = getLayers(configuration, layout);
      if (layers.length >= MAX_WRAP_ARTWORK_LAYERS) {
        revokeArtworkUrl(artwork);
        return null;
      }
      const placement = getNewLayerPlacement(
        layout,
        configuration,
        artwork,
        layers.length,
        DEFAULT_PLACEMENT.extendToBottom && definitionOf(configuration).extendToBottomAvailable,
      );
      const layer = createWrapLayer(artwork, placement);
      update((c) => ({ [layerField(layout)]: [...getLayers(c, layout), layer] }));
      return layer.id;
    },

    removeArtworkLayer: (layout, layerId) => {
      const removed = getLayers(get().configuration, layout).find((layer) => layer.id === layerId);
      if (!removed) return;
      revokeArtworkUrl(removed.artwork);
      update((c) => ({ [layerField(layout)]: getLayers(c, layout).filter((layer) => layer.id !== layerId) }));
    },

    moveArtworkLayer: (layout, layerId, direction) =>
      update((c) => {
        const layers = [...getLayers(c, layout)];
        const from = layers.findIndex((layer) => layer.id === layerId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= layers.length) return {};
        [layers[from], layers[to]] = [layers[to], layers[from]];
        return { [layerField(layout)]: layers };
      }),

    addWrapLayer: (artwork) => get().addArtworkLayer('WRAP', artwork),
    removeWrapLayer: (layerId) => get().removeArtworkLayer('WRAP', layerId),
    moveWrapLayer: (layerId, direction) => get().moveArtworkLayer('WRAP', layerId, direction),

    setPanelPlacement: (target, placement) =>
      update((c) =>
        writeSlot(c, target, {
          placement: normalizePlacement(placement, getArtworkTargetArea(target, c, placement)),
        }),
      ),

    resetPanelPlacement: (target) => update((c) => writeSlot(c, target, { placement: DEFAULT_PLACEMENT })),

    fillPanelPlacement: (target) =>
      update((c) =>
        writeSlot(c, target, { placement: fillPlacement(getArtworkSlot(c, target).placement.extendToBottom === true) }),
      ),

    alignPanelArtwork: (target, alignment) =>
      update((c) => {
        const { artwork, placement } = getArtworkSlot(c, target);
        if (!artwork) return {};
        const area = getArtworkTargetArea(target, c, placement);
        return writeSlot(c, target, { placement: alignPlacement(placement, alignment, area, artwork) });
      }),

    setPanelExtendToBottom: (target, extendToBottom) =>
      update((c) => {
        const { artwork, placement } = getArtworkSlot(c, target);
        if ((placement.extendToBottom === true) === extendToBottom) return {};
        if (getLayerTargetInfo(target)?.layout === 'SHEET') return {}; // the sheet always includes the allowance
        if (extendToBottom && !definitionOf(c).extendToBottomAvailable) return {};
        const from = getArtworkTargetArea(target, c, placement);
        const to = getArtworkTargetArea(target, c, { extendToBottom });
        const next = setPlacementExtendToBottom(placement, extendToBottom, from, to, artwork);
        return writeSlot(c, target, { placement: next });
      }),

    addPantoneColor: (code, hex) => {
      const { configuration } = get();
      const { pantoneColors } = configuration.print;
      const error = validatePantoneColorToAdd(pantoneColors, code, definitionOf(configuration).print.maxColors);
      if (error) return error;
      const normalizedCode = normalizePantoneCode(code);
      const preview =
        hex === undefined
          ? suggestPantonePreviewHex(normalizedCode, pantoneColors.map((color) => color.hex))
          : normalizeHex(hex);
      if (!preview) return 'INVALID_HEX';
      update((c) => ({
        print: { ...c.print, pantoneColors: [...pantoneColors, { code: normalizedCode, hex: preview }] },
      }));
      return null;
    },

    setPantoneColorHex: (index, hex) => {
      const preview = normalizeHex(hex);
      if (!preview) return;
      update((c) =>
        index >= 0 && index < c.print.pantoneColors.length
          ? {
              print: {
                ...c.print,
                pantoneColors: c.print.pantoneColors.map((color, i) => (i === index ? { ...color, hex: preview } : color)),
              },
            }
          : {},
      );
    },

    removePantoneColor: (index) =>
      update((c) => ({ print: { ...c.print, pantoneColors: c.print.pantoneColors.filter((_, i) => i !== index) } })),

    setColorAnalysis: (patch) =>
      update((c) => {
        const current = normalizeColorAnalysis(c.print.colorAnalysis);
        const colorAnalysis = normalizeColorAnalysis({
          mergeTolerance: patch.mergeTolerance ?? current.mergeTolerance,
          minAreaShare: patch.minAreaShare ?? current.minAreaShare,
        });
        return { print: { ...c.print, colorAnalysis } };
      }),

    setPackaging: (packaging) => update((c) => (definitionOf(c).packaging.includes(packaging) ? { packaging } : {})),

    setWindowType: (type) =>
      update((c) => {
        const current = getWindow(c);
        if (type === null) return current ? { window: null } : {};
        if (!definitionOf(c).windowAvailable || !WINDOW_RULES.types.includes(type) || current?.type === type) return {};
        return { window: createWindow(type, getWindowDimensions(c), current) };
      }),

    setWindowMaterial: (material) =>
      update((c) => {
        const current = getWindow(c);
        if (!current || !WINDOW_RULES.materials.includes(material)) return {};
        return { window: { ...current, material } };
      }),

    setWindowValue: (field, value) =>
      update((c) => {
        const current = getWindow(c);
        if (!current || !Number.isFinite(value)) return {};
        if ((field === 'height' || field === 'bottomOffset') && current.type !== 'RECTANGLE') return {};
        return { window: constrainWindow({ ...current, [field]: value } as typeof current, getWindowDimensions(c)) };
      }),
  };
});
