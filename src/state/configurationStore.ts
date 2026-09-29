import { create } from 'zustand';
import { BAG_TYPES } from '../domain/config/productCatalog';
import { constrainDimension, constrainDimensions, constrainGrammage, constrainQuantity } from '../domain/constraints';
import { createConfiguration, createHandle } from '../domain/factories';
import {
  constrainPaperToVariant,
  getHandleVariantDefinition,
  getStandardSizeViolations,
  getSupportedHandleTypes,
  type PaperAdjustment,
} from '../domain/handleVariants';
import type {
  Artwork,
  BagConfiguration,
  BagType,
  Dimensions,
  HandleType,
  PackagingType,
  PanelPosition,
  PaperColor,
  PaperType,
} from '../domain/types';
import { normalizePantoneCode, validatePantoneColorToAdd, type PantoneError } from '../domain/validation/production';

// Single source of truth for the configuration. The 3D renderer only reads from here.
// Every action produces a valid BagConfiguration: invalid input is constrained or ignored, never stored.
type ConfigurationState = {
  configuration: BagConfiguration;
  setProductType: (type: BagType) => void;
  /** Clamps into the effective limits (depth ≤ width) and snaps to the 5 mm step. */
  setDimension: (key: keyof Dimensions, value: number) => void;
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
  /** Replaces or removes panel artwork; the previous object URL is revoked. */
  setPanelArtwork: (position: PanelPosition, artwork: Artwork | null) => void;
  /** Returns the validation error, or null when the colour was added. */
  addPantoneColor: (code: string) => PantoneError | null;
  removePantoneColor: (index: number) => void;
  setPackaging: (packaging: PackagingType) => void;
  setQuantity: (quantity: number) => void;
};

function revokeArtworkUrl(artwork: Artwork | null) {
  if (artwork?.fileUrl.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(artwork.fileUrl);
  }
}

export const useConfigurationStore = create<ConfigurationState>((set, get) => {
  const update = (patch: (configuration: BagConfiguration) => Partial<BagConfiguration>) =>
    set(({ configuration }) => ({ configuration: { ...configuration, ...patch(configuration) } }));
  const definitionOf = (configuration: BagConfiguration) => BAG_TYPES[configuration.productType];
  const variantOf = (configuration: BagConfiguration) =>
    getHandleVariantDefinition(definitionOf(configuration), configuration.handle);

  return {
    configuration: createConfiguration('BLOCK'),

    setProductType: (type) => {
      const { configuration } = get();
      if (type === configuration.productType || !BAG_TYPES[type].available) return;
      Object.values(configuration.panels).forEach((panel) => revokeArtworkUrl(panel.artwork));
      set({ configuration: createConfiguration(type) });
    },

    setDimension: (key, value) =>
      update(({ dimensions, productType }) => ({
        dimensions: { ...dimensions, [key]: constrainDimension(key, value, dimensions, BAG_TYPES[productType].limits) },
      })),

    applyStandardSize: (sizeId) => {
      const { configuration } = get();
      const { limits } = definitionOf(configuration);
      const standardSize = variantOf(configuration).standardSizes.find((s) => s.id === sizeId);
      if (!standardSize || getStandardSizeViolations(standardSize, limits).length > 0) return false;
      update((c) => ({ dimensions: constrainDimensions(standardSize.dimensions, c.dimensions, limits) }));
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

    setPanelArtwork: (position, artwork) => {
      const previous = get().configuration.panels[position].artwork;
      if (previous && previous.fileUrl !== artwork?.fileUrl) revokeArtworkUrl(previous);
      update(({ panels }) => ({ panels: { ...panels, [position]: { ...panels[position], artwork } } }));
    },

    addPantoneColor: (code) => {
      const { configuration } = get();
      const { pantoneColors } = configuration.print;
      const error = validatePantoneColorToAdd(pantoneColors, code, definitionOf(configuration).print.maxColors);
      if (error) return error;
      update((c) => ({ print: { ...c.print, pantoneColors: [...pantoneColors, normalizePantoneCode(code)] } }));
      return null;
    },

    removePantoneColor: (index) =>
      update((c) => ({ print: { ...c.print, pantoneColors: c.print.pantoneColors.filter((_, i) => i !== index) } })),

    setPackaging: (packaging) => update((c) => (definitionOf(c).packaging.includes(packaging) ? { packaging } : {})),

    setQuantity: (quantity) =>
      update((c) => ({ quantity: constrainQuantity(quantity, definitionOf(c).minQuantity, c.quantity) })),
  };
});
