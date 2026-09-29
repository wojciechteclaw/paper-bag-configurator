import { BAG_TYPES } from './config/productCatalog';
import type { Artwork, BagConfiguration, BagPanel, BagPanels, BagType, Handle, HandleType, PanelPosition } from './types';

export const PANEL_POSITIONS: PanelPosition[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];

const newId = () => crypto.randomUUID();

export function createPanel(position: PanelPosition): BagPanel {
  return { id: newId(), position, artwork: null, placement: { mode: 'FILL' } };
}

export function createHandle(type: HandleType): Handle {
  return {
    id: newId(),
    type,
    color: '#c8a57a',
    width: type === 'TWISTED_PAPER' ? 5 : 15,
    length: 180,
    patch: { width: 80, height: 50 },
  };
}

export function createConfiguration(productType: BagType = 'BLOCK'): BagConfiguration {
  const definition = BAG_TYPES[productType];
  const panels = Object.fromEntries(PANEL_POSITIONS.map((p) => [p, createPanel(p)])) as BagPanels;
  return {
    id: newId(),
    productType,
    dimensions: { ...definition.defaultDimensions },
    paper: { color: 'BROWN', grammage: definition.grammage.default, fscCertified: false },
    handle: null,
    panels,
    print: { technology: 'FLEXO', pantoneColors: [] },
    packaging: 'CARTON',
    quantity: definition.minQuantity,
  };
}

export function createArtwork(params: Omit<Artwork, 'id'>): Artwork {
  return { id: newId(), ...params };
}
