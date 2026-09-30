// Switching the bag type (BLOCK ↔ FOLDED) of an existing configuration. Pure TS.
//
// The configuration is carried over as far as the new type allows, and everything the new type does not offer is
// brought into its options (same idea as `constrainPaperToVariant` for handle variants). What had to change is
// reported so the UI can tell the user. Artwork (both layouts), print colours, paper colour / FSC and the id are kept.

import { setPlacementExtendToBottom } from './artworkPlacement';
import { getArtworkTargetArea, getWrapLayers, wrapLayerTarget } from './artworkLayout';
import { BAG_TYPES, type BagTypeDefinition } from './config/productCatalog';
import { constrainDimensions } from './constraints';
import { PANEL_POSITIONS } from './factories';
import { constrainGlueFlapWidth, getGlueFlapWidth } from './glueFlap';
import { constrainPaperToVariant, getHandleVariantDefinition, getSupportedHandleTypes, type PaperAdjustment } from './handleVariants';
import { isGussetOutsideRecommended } from './geometry/gussetedBag';
import { getDimensionWarnings, type DimensionWarning } from './validation/bottom';
import type { ArtworkPlacement, ArtworkTarget, BagConfiguration, BagPanels, BagType, Dimensions, HandleType, PackagingType, PaperColor, WrapArtworkLayer } from './types';

/** A change made to fit the configuration to a new bag type. */
export type ProductTypeAdjustment =
  | { field: 'handle'; from: HandleType }
  | { field: 'dimension'; key: keyof Dimensions; from: number; to: number }
  | { field: 'paperColor'; from: PaperColor; to: PaperColor }
  | { field: 'packaging'; from: PackagingType; to: PackagingType }
  | { field: 'pantoneColors'; removed: number }
  /** Glue flap / seam overlap s, mm (reset to the new type's default, or clamped into its range). */
  | { field: 'glueFlap'; from: number; to: number }
  /** "Extend to bottom" was switched off on these targets (the new type prints no bottom allowance). */
  | { field: 'extendToBottom'; targets: ArtworkTarget[] }
  | PaperAdjustment;

const DIMENSION_KEYS: (keyof Dimensions)[] = ['width', 'height', 'depth'];

/**
 * Soft dimension warnings of any bag type: the block bottom's (`getDimensionWarnings`), and for the gusseted-bag bag
 * GUSSET_OUTSIDE_RECOMMENDED — F outside 0.4–0.7·W [K] (F ≤ W stays a hard limit).
 */
export type ProductDimensionWarning = DimensionWarning | 'GUSSET_OUTSIDE_RECOMMENDED';

export function getDimensionWarningsFor(
  productType: BagType,
  dimensions: Pick<Dimensions, 'width' | 'depth'>,
): ProductDimensionWarning[] {
  if (productType === 'FOLDED') return isGussetOutsideRecommended(dimensions) ? ['GUSSET_OUTSIDE_RECOMMENDED'] : [];
  return getDimensionWarnings(dimensions);
}

/** Placement without "extend to bottom" (a CUSTOM image stays where it is on the wall). */
function withoutBottomExtension(
  target: ArtworkTarget,
  placement: ArtworkPlacement,
  configuration: Pick<BagConfiguration, 'dimensions'>,
  artwork: { width: number; height: number } | null,
): ArtworkPlacement {
  const from = getArtworkTargetArea(target, configuration.dimensions, placement);
  const to = getArtworkTargetArea(target, configuration.dimensions, { extendToBottom: false });
  return setPlacementExtendToBottom(placement, false, from, to, artwork);
}

/**
 * Drops "extend to bottom" from every panel and every whole-bag layer when `definition` does not offer it (the
 * gusseted bag prints no bottom strip). All layers are kept (order, ids, artwork); only their placements change.
 * `targets` lists what was changed. Shared by the type switch and by loading a saved configuration.
 */
export function constrainPlacements(
  configuration: Pick<BagConfiguration, 'dimensions' | 'panels'> & Partial<Pick<BagConfiguration, 'wrapLayers'>>,
  definition: Pick<BagTypeDefinition, 'extendToBottomAvailable'>,
): { panels: BagPanels; wrapLayers: WrapArtworkLayer[]; targets: ArtworkTarget[] } {
  const layers = getWrapLayers(configuration);
  if (definition.extendToBottomAvailable) return { panels: configuration.panels, wrapLayers: [...layers], targets: [] };
  const targets: ArtworkTarget[] = [];
  const panels = { ...configuration.panels };
  for (const position of PANEL_POSITIONS) {
    const panel = panels[position];
    if (!panel.placement.extendToBottom) continue;
    targets.push(position);
    panels[position] = { ...panel, placement: withoutBottomExtension(position, panel.placement, configuration, panel.artwork) };
  }
  const wrapLayers = layers.map((layer) => {
    if (!layer.placement.extendToBottom) return layer;
    const target = wrapLayerTarget(layer.id);
    targets.push(target);
    return { ...layer, placement: withoutBottomExtension(target, layer.placement, configuration, layer.artwork) };
  });
  return { panels, wrapLayers, targets };
}

/**
 * The configuration as a bag of `type`: unsupported handle removed, dimensions clamped into the new limits (with the
 * depth ≤ width rule, 5 mm step), paper fitted to the new handle variant, paper colour / packaging / number of print
 * colours fitted to the type, and "extend to bottom" dropped where the type prints no bottom allowance. Returns the
 * same object and no adjustments when `type` is the current one.
 */
export function changeProductType(
  configuration: BagConfiguration,
  type: BagType,
): { configuration: BagConfiguration; adjustments: ProductTypeAdjustment[] } {
  if (configuration.productType === type) return { configuration, adjustments: [] };
  const definition = BAG_TYPES[type];
  const adjustments: ProductTypeAdjustment[] = [];

  let handle = configuration.handle;
  if (handle && !getSupportedHandleTypes(definition).includes(handle.type)) {
    adjustments.push({ field: 'handle', from: handle.type });
    handle = null;
  }

  const dimensions = constrainDimensions(configuration.dimensions, configuration.dimensions, definition.limits);
  for (const key of DIMENSION_KEYS) {
    if (dimensions[key] !== configuration.dimensions[key]) {
      adjustments.push({ field: 'dimension', key, from: configuration.dimensions[key], to: dimensions[key] });
    }
  }

  const fitted = constrainPaperToVariant(configuration.paper, getHandleVariantDefinition(definition, handle));
  adjustments.push(...fitted.adjustments);
  let paper = fitted.paper;
  if (!definition.paperColors.includes(paper.color)) {
    adjustments.push({ field: 'paperColor', from: paper.color, to: definition.paperColors[0] });
    paper = { ...paper, color: definition.paperColors[0] };
  }

  let packaging = configuration.packaging;
  if (!definition.packaging.includes(packaging)) {
    adjustments.push({ field: 'packaging', from: packaging, to: definition.packaging[0] });
    packaging = definition.packaging[0];
  }

  let print = configuration.print;
  if (print.pantoneColors.length > definition.print.maxColors) {
    adjustments.push({ field: 'pantoneColors', removed: print.pantoneColors.length - definition.print.maxColors });
    print = { ...print, pantoneColors: print.pantoneColors.slice(0, definition.print.maxColors) };
  }

  // Glue flap / seam overlap s: an untouched value (the old type's default) becomes the new type's default (block 10,
  // gusseted 15 mm [K]); a value the user chose is only clamped into the new type's range.
  const currentFlap = getGlueFlapWidth(configuration);
  const glueFlapWidth =
    currentFlap === BAG_TYPES[configuration.productType].glueFlap.default
      ? definition.glueFlap.default
      : constrainGlueFlapWidth(currentFlap, type, currentFlap);
  if (glueFlapWidth !== currentFlap) adjustments.push({ field: 'glueFlap', from: currentFlap, to: glueFlapWidth });

  const { panels, wrapLayers, targets } = constrainPlacements(configuration, definition);
  if (targets.length > 0) adjustments.push({ field: 'extendToBottom', targets });

  return {
    configuration: {
      ...configuration,
      productType: type,
      handle,
      dimensions,
      glueFlapWidth,
      paper,
      packaging,
      print,
      panels,
      wrapLayers,
    },
    adjustments,
  };
}
