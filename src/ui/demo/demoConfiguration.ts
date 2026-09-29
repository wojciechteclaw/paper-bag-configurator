import { createArtwork } from '../../domain/factories';
import type { Dimensions, HandleType, PanelPosition, PaperColor } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

// Demo configuration (client request 29.09.2026): block-bottom bag W 250 × D 200 × H 400 mm, white kraft 100 g/m², FSC,
// internal flat paper handle, the "wave" sample artwork (public/sample-images) on all four walls, every one stretched
// onto the bottom (SPEC §4f). Handle / FSC follow the client's example configuration.

export const DEMO_CONFIGURATION: {
  dimensions: Dimensions;
  handle: HandleType;
  fscCertified: boolean;
  paperColor: PaperColor;
  grammage: number;
  artwork: Record<PanelPosition, string>;
} = {
  dimensions: { width: 250, height: 400, depth: 200 },
  handle: 'FLAT_PAPER',
  fscCertified: true,
  paperColor: 'WHITE',
  grammage: 100,
  artwork: {
    FRONT: 'sample-images/wave_front.webp',
    BACK: 'sample-images/wave_back.webp',
    LEFT: 'sample-images/wave_left.webp',
    RIGHT: 'sample-images/wave_right.webp',
  },
};

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

/**
 * Loads the demo into the configuration store: block bag, demo dimensions (width first so the depth ≤ width rule
 * holds), flat handle, white FSC paper, grammage, and the four wall artworks with "extend to bottom" on. Resolves once all images are
 * applied; rejects if any image is missing (the configuration is then left with whatever loaded).
 */
export async function loadDemoConfiguration(base: string = import.meta.env.BASE_URL): Promise<void> {
  const store = () => useConfigurationStore.getState();
  store().setProductType('BLOCK');
  const { width, height, depth } = DEMO_CONFIGURATION.dimensions;
  store().setDimension('width', width);
  store().setDimension('height', height);
  store().setDimension('depth', depth);
  store().setHandle(DEMO_CONFIGURATION.handle); // before the paper: the handle variant constrains the grammage
  store().setPaperColor(DEMO_CONFIGURATION.paperColor);
  store().setGrammage(DEMO_CONFIGURATION.grammage);
  store().setFscCertified(DEMO_CONFIGURATION.fscCertified);
  const entries = Object.entries(DEMO_CONFIGURATION.artwork) as [PanelPosition, string][];
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const infos = await Promise.all(entries.map(([, path]) => probeImage(`${prefix}${path}`)));
  entries.forEach(([position, path], i) => {
    const info = infos[i];
    store().setPanelArtwork(
      position,
      createArtwork({ fileName: path.split('/').pop() ?? path, fileUrl: `${prefix}${path}`, ...info }),
    );
    store().setPanelExtendToBottom(position, true);
  });
}
