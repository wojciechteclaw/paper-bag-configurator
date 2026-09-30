import { createArtwork } from '../../domain/factories';
import type { BagType, Dimensions, HandleType, PanelPosition, PaperColor } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

// Demo configurations, one per bag type — the DEMO button loads the one of the currently selected type. Image paths are
// relative to `public/` (the single list of demo files):
// - BLOCK (client request 29.09.2026): block-bottom bag W 250 × D 200 × H 400 mm, white kraft 100 g/m², FSC, internal
//   twisted paper rope handle, the "wave" sample artwork (public/carrier-bag) on all four walls, every one stretched onto
//   the bottom (SPEC §4f).
// - FOLDED (client request 30.09.2026): gusseted bag 150 + 60 × 250 mm, brown kraft 40 g/m², FSC, one whole-bag
//   (WRAP) artwork layer public/gusseted-bag/gussted.webp around the full width (supplied by the client).
// Missing images are skipped: the configuration still loads.

export type DemoConfiguration = {
  productType: BagType;
  dimensions: Dimensions;
  handle: HandleType | null;
  fscCertified: boolean;
  paperColor: PaperColor;
  grammage: number;
  /** Artwork per wall, path relative to `public/`. */
  artwork: Partial<Record<PanelPosition, string>>;
  /** Whole-bag (WRAP) artwork layers, bottom → top, paths relative to `public/`; non-empty = the WRAP layout. */
  wrapLayers?: string[];
  /** "Extend to bottom" on every wall with artwork (only where the bag type offers it). */
  extendToBottom: boolean;
};

export const DEMO_CONFIGURATIONS: Readonly<Record<BagType, DemoConfiguration>> = {
  BLOCK: {
    productType: 'BLOCK',
    dimensions: { width: 250, height: 400, depth: 200 },
    handle: 'TWISTED_PAPER',
    fscCertified: true,
    paperColor: 'WHITE',
    grammage: 100,
    artwork: {
      FRONT: 'carrier-bag/wave_front.webp',
      BACK: 'carrier-bag/wave_back.webp',
      LEFT: 'carrier-bag/wave_left.webp',
      RIGHT: 'carrier-bag/wave_right.webp',
    },
    extendToBottom: true,
  },
  FOLDED: {
    productType: 'FOLDED',
    dimensions: { width: 150, height: 250, depth: 60 },
    handle: null,
    fscCertified: true,
    paperColor: 'BROWN',
    grammage: 40,
    artwork: {},
    // FILL over the whole wrap 2W + 2F = 420 mm × H 250 mm, starting at FRONT's left edge.
    wrapLayers: ['gusseted-bag/gussted.webp'],
    extendToBottom: false,
  },
};

/** The block-bottom demo (kept for existing callers). */
export const DEMO_CONFIGURATION = DEMO_CONFIGURATIONS.BLOCK;

type ImageInfo = { width: number; height: number; sizeBytes: number; mimeType: string };

/** Pixel size (and byte size, when the server reports it) of a public image; rejects when it cannot be loaded. */
async function probeImage(url: string): Promise<ImageInfo> {
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`Demo image could not be loaded: ${url}`));
    image.src = url;
  });
  let sizeBytes = 0;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    sizeBytes = Number(response.headers.get('content-length')) || 0;
  } catch {
    // Size is informational only.
  }
  return { ...size, sizeBytes, mimeType: url.endsWith('.webp') ? 'image/webp' : 'image/png' };
}

/** What a demo load could not apply: image paths (relative to `public/`) that failed to load. */
export type DemoLoadResult = { missing: string[]; total: number };

/**
 * Loads the demo of `productType` into the configuration store: a fresh configuration of that type, the demo
 * dimensions (width first so the depth ≤ width rule holds), handle (before the paper: the handle variant constrains
 * the grammage), paper, FSC and the wall artwork. Images that cannot be loaded are skipped and listed in the result.
 */
export async function loadDemoConfiguration(
  base: string = import.meta.env.BASE_URL,
  productType: BagType = 'BLOCK',
): Promise<DemoLoadResult> {
  const demo = DEMO_CONFIGURATIONS[productType];
  const store = () => useConfigurationStore.getState();
  store().resetConfiguration(demo.productType); // no leftover artwork / layout / colours
  const { width, height, depth } = demo.dimensions;
  store().setDimension('width', width);
  store().setDimension('height', height);
  store().setDimension('depth', depth);
  store().setHandle(demo.handle);
  store().setPaperColor(demo.paperColor);
  store().setGrammage(demo.grammage);
  store().setFscCertified(demo.fscCertified);
  const entries = Object.entries(demo.artwork) as [PanelPosition, string][];
  const layers = demo.wrapLayers ?? [];
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const artworkOf = (path: string, info: ImageInfo) =>
    createArtwork({ fileName: path.split('/').pop() ?? path, fileUrl: `${prefix}${path}`, ...info });
  const [results, layerResults] = await Promise.all([
    Promise.allSettled(entries.map(([, path]) => probeImage(`${prefix}${path}`))),
    Promise.allSettled(layers.map((path) => probeImage(`${prefix}${path}`))),
  ]);
  const missing: string[] = [];
  if (layers.length > 0) store().setArtworkLayout('WRAP');
  layers.forEach((path, i) => {
    const result = layerResults[i];
    if (result.status === 'rejected') missing.push(path);
    else store().addWrapLayer(artworkOf(path, result.value));
  });
  entries.forEach(([position, path], i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      missing.push(path);
      return;
    }
    store().setPanelArtwork(position, artworkOf(path, result.value));
    if (demo.extendToBottom) store().setPanelExtendToBottom(position, true);
  });
  return { missing, total: entries.length + layers.length };
}
