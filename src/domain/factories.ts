import { DEFAULT_PLACEMENT } from './artworkPlacement';
import { BAG_TYPES, COLOR_ANALYSIS_DEFAULTS, DEFAULT_ARTWORK_LAYOUT, HANDLE_DEFAULTS } from './config/productCatalog';
import { getHandleVariantDefinition } from './handleVariants';
import type {
  Artwork,
  ArtworkPlacement,
  BagConfiguration,
  BagPanel,
  BagPanels,
  BagType,
  Handle,
  HandleType,
  PanelPosition,
  WrapArtworkLayer,
} from './types';

export const PANEL_POSITIONS: PanelPosition[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];

const newId = () => crypto.randomUUID();

export function createPanel(position: PanelPosition): BagPanel {
  return { id: newId(), position, artwork: null, placement: { ...DEFAULT_PLACEMENT } };
}

/** New whole-bag artwork layer (docs/SPEC.md §3b): FILL over the wall row unless a placement is given. */
export function createWrapLayer(artwork: Artwork, placement: ArtworkPlacement = DEFAULT_PLACEMENT): WrapArtworkLayer {
  return { id: newId(), artwork, placement: { ...placement } };
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
    artworkLayout: DEFAULT_ARTWORK_LAYOUT,
    wrapLayers: [],
    print: { technology: 'FLEXO', pantoneColors: [], colorAnalysis: { ...COLOR_ANALYSIS_DEFAULTS } },
    packaging: 'CARTON',
    glueFlapWidth: definition.glueFlap.default,
    ...(definition.bottomFold ? { bottomFoldDepth: definition.bottomFold.default } : {}),
  };
}

export function createArtwork(params: Omit<Artwork, 'id'>): Artwork {
  return { id: newId(), ...params };
}
