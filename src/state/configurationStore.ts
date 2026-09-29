import { create } from 'zustand';
import { BAG_TYPES } from '../domain/config/productCatalog';
import { constrainDimension, constrainGrammage, constrainQuantity } from '../domain/constraints';
import { createConfiguration, createHandle } from '../domain/factories';
import type {
  Artwork,
  BagConfiguration,
  BagType,
  Dimensions,
  HandleType,
  PackagingType,
  PanelPosition,
  PaperColor,
} from '../domain/types';
import { normalizePantoneCode, validatePantoneColorToAdd, type PantoneError } from '../domain/validation/production';

// Single source of truth for the configuration. The 3D renderer only reads from here.
// Every action produces a valid BagConfiguration: invalid input is constrained or ignored, never stored.
type ConfigurationState = {
  configuration: BagConfiguration;
  setProductType: (type: BagType) => void;
  /** Clamps into the effective limits (depth ≤ width) and snaps to the 5 mm step. */
  setDimension: (key: keyof Dimensions, value: number) => void;
  setPaperColor: (color: PaperColor) => void;
  setGrammage: (grammage: number) => void;
  setFscCertified: (fscCertified: boolean) => void;
  setHandle: (type: HandleType | null) => void;
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

    setPaperColor: (color) =>
      update((c) => (definitionOf(c).paperColors.includes(color) ? { paper: { ...c.paper, color } } : {})),

    setGrammage: (grammage) =>
      update((c) => ({
        paper: { ...c.paper, grammage: constrainGrammage(grammage, definitionOf(c).grammage, c.paper.grammage) },
      })),

    setFscCertified: (fscCertified) => update((c) => ({ paper: { ...c.paper, fscCertified } })),

    setHandle: (type) =>
      update((c) => {
        if (type === null) return { handle: null };
        if (!definitionOf(c).supportedHandles.includes(type) || c.handle?.type === type) return {};
        return { handle: createHandle(type) };
      }),

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
