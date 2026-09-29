// Handle-variant dependent product options (paper types, grammage, moisture barrier, standard sizes). Pure TS.
import type {
  BagTypeDefinition,
  DimensionLimits,
  HandleVariantDefinition,
  Range,
  StandardSize,
} from './config/productCatalog';
import { clampToStep } from './constraints';
import type { Dimensions, Handle, HandleType, HandleVariant, Paper, PaperType } from './types';

export function getHandleVariant(handle: Handle | null): HandleVariant {
  return handle ? handle.type : 'NONE';
}

/** Handle types the bag type supports (every variant except `NONE`), in UI order. */
export function getSupportedHandleTypes(definition: BagTypeDefinition): HandleType[] {
  return definition.handleVariants.flatMap((v) => (v.variant === 'NONE' ? [] : [v.variant]));
}

/** Options for `variant`, or `undefined` when the bag type does not offer it. */
export function findHandleVariantDefinition(
  definition: BagTypeDefinition,
  variant: HandleVariant,
): HandleVariantDefinition | undefined {
  return definition.handleVariants.find((v) => v.variant === variant);
}

/** Options for the bag's current handle; falls back to the first (no-handle) variant. */
export function getHandleVariantDefinition(
  definition: BagTypeDefinition,
  handle: Handle | null,
): HandleVariantDefinition {
  return findHandleVariantDefinition(definition, getHandleVariant(handle)) ?? definition.handleVariants[0];
}

/** A change made to the paper so it fits a (new) handle variant. The UI explains these to the user. */
export type PaperAdjustment =
  | { field: 'type'; from: PaperType; to: PaperType }
  | { field: 'grammage'; from: number; to: number }
  | { field: 'moistureBarrier'; from: true; to: false };

/**
 * Brings `paper` into the set allowed by `variant`: an unavailable paper type becomes the variant's default,
 * grammage is clamped (and snapped) into the variant's range, and the moisture barrier is dropped where
 * not offered. Colour and FSC are not variant-dependent and stay untouched. Returns the same `paper` object
 * when nothing had to change.
 */
export function constrainPaperToVariant(
  paper: Paper,
  variant: HandleVariantDefinition,
): { paper: Paper; adjustments: PaperAdjustment[] } {
  const adjustments: PaperAdjustment[] = [];
  const next = { ...paper };

  if (!variant.paperTypes.includes(paper.type)) {
    next.type = variant.defaultPaperType;
    adjustments.push({ field: 'type', from: paper.type, to: next.type });
  }
  const grammage = clampToStep(paper.grammage, variant.grammage, variant.grammage.step);
  if (grammage !== paper.grammage) {
    next.grammage = grammage;
    adjustments.push({ field: 'grammage', from: paper.grammage, to: grammage });
  }
  if (paper.moistureBarrier && !variant.moistureBarrierAvailable) {
    next.moistureBarrier = false;
    adjustments.push({ field: 'moistureBarrier', from: true, to: false });
  }
  return adjustments.length === 0 ? { paper, adjustments } : { paper: next, adjustments };
}

/** The standard size exactly matching `dimensions`, or `null` for a custom size. */
export function findStandardSize(dimensions: Dimensions, sizes: StandardSize[]): StandardSize | null {
  return (
    sizes.find(
      ({ dimensions: d }) => d.width === dimensions.width && d.height === dimensions.height && d.depth === dimensions.depth,
    ) ?? null
  );
}

export type StandardSizeViolation = { key: keyof Dimensions; value: number; range: Range };

/** Dimensions of a standard size that fall outside the configurator's limits (empty → the size is selectable). */
export function getStandardSizeViolations(size: StandardSize, limits: DimensionLimits): StandardSizeViolation[] {
  return (Object.keys(limits) as (keyof Dimensions)[]).flatMap((key) => {
    const value = size.dimensions[key];
    const range = limits[key];
    return value < range.min || value > range.max ? [{ key, value, range }] : [];
  });
}
