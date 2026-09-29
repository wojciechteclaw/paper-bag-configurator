import { BAG_TYPES, HANDLE_DEFAULTS } from './config/productCatalog';
import { getHandleVariantDefinition } from './handleVariants';
import type { Artwork, BagConfiguration, BagPanel, BagPanels, BagType, Handle, HandleType, PanelPosition } from './types';

export const PANEL_POSITIONS: PanelPosition[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];

const newId = () => crypto.randomUUID();

export function createPanel(position: PanelPosition): BagPanel {
  return { id: newId(), position, artwork: null, placement: { mode: 'FILL' } };
}

export function createHandle(type: HandleType): Handle {
  const { patch, ...defaults } = HANDLE_DEFAULTS[type];
  return { id: newId(), type, ...defaults, ...(patch ? { patch: { ...patch } } : {}) };
}

export function createConfiguration(productType: BagType = 'BLOCK'): BagConfiguration {
  const definition = BAG_TYPES[productType];
  const variant = getHandleVariantDefinition(definition, null);
  const panels = Object.fromEntries(PANEL_POSITIONS.map((p) => [p, createPanel(p)])) as BagPanels;
  return {
    id: newId(),
    productType,
    dimensions: { ...definition.defaultDimensions },
    paper: {
      type: variant.defaultPaperType,
      color: 'BROWN',
      grammage: variant.grammage.default,
      fscCertified: false,
      moistureBarrier: false,
    },
    handle: null,
    panels,
    print: { technology: 'FLEXO', pantoneColors: [] },
    packaging: 'CARTON',
  };
}

export function createArtwork(params: Omit<Artwork, 'id'>): Artwork {
  return { id: newId(), ...params };
}
