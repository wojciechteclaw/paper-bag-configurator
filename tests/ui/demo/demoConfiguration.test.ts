import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import { getArtworkLayout, getPrintFilePlacement, getSheetLayers, getWrapLayers } from '../../../src/domain/artworkLayout';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { DEMO_COUNT, DemoLoadError, loadDemoConfiguration } from '../../../src/ui/demo/demoConfiguration';

// The demos are folders public/demo<N>/ with config.json + image-1…; fetch serves them from disk here, and a stub Image
// "loads" with a fixed size (jsdom never decodes images).
const CONFIGS = import.meta.glob<string>('/public/demo*/config.json', { eager: true, query: '?raw', import: 'default' });
let failingImages: string[] = [];

class LoadingImage {
  naturalWidth = 2000;
  naturalHeight = 1000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    queueMicrotask(() => (failingImages.some((name) => value.endsWith(name)) ? this.onerror?.() : this.onload?.()));
  }
}

beforeEach(() => {
  failingImages = [];
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  vi.stubGlobal('Image', LoadingImage);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '1234' } });
      const text = CONFIGS[`/public${url}`];
      return text !== undefined ? new Response(text) : new Response('not found', { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const config = () => useConfigurationStore.getState().configuration;

describe('demo folders public/demo<N> (config.json + image-N)', () => {
  it('has five demos, each with a config.json', () => {
    expect(DEMO_COUNT).toBe(5);
    for (let i = 1; i <= DEMO_COUNT; i++) expect(CONFIGS[`/public/demo${i}/config.json`]).toBeDefined();
  });

  it('Demo 2: block-bottom bag 250 × 180 × 420, brown recycled 80 g/m² FSC, flat paper handle, wave artwork on all walls extended to the bottom', async () => {
    const result = await loadDemoConfiguration(2, '/');
    expect(result).toEqual({ missing: [], total: 4 });
    const c = config();
    expect(c.productType).toBe('BLOCK');
    // Loaded as written: valid (depth ≤ width, height within range), so sanitizing clamps nothing.
    expect(c.dimensions).toEqual({ width: 250, height: 420, depth: 180 });
    expect(c.paper).toMatchObject({ type: 'RECYCLED', color: 'BROWN', grammage: 80, fscCertified: true });
    expect(c.handle?.type).toBe('FLAT_PAPER');
    // The wide files (2500 px) on the 250 mm walls, the narrow ones (1800 px) on the 180 mm sides (client, 30.09.2026).
    const files = { FRONT: 'image-4', BACK: 'image-2', LEFT: 'image-3', RIGHT: 'image-1' } as const;
    (['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const).forEach((position) => {
      // Pixel size and bytes come from the loaded image (mocked here), not from config.json.
      expect(c.panels[position].artwork).toMatchObject({ fileUrl: `/demo2/${files[position]}.webp`, width: 2000, height: 1000, sizeBytes: 1234 });
      expect(c.panels[position].placement).toEqual({ mode: 'FILL', extendToBottom: true });
    });
  });

  it('Demo 4: gusseted bag 150 + 60 × 250, one whole-sheet layer image-1', async () => {
    await loadDemoConfiguration(4, '/');
    const c = config();
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.glueFlapWidth).toBe(15);
    expect(getArtworkLayout(c)).toBe('SHEET');
    expect(getSheetLayers(c).map((layer) => layer.artwork.fileUrl)).toEqual(['/demo4/image-1.webp']);
    // The 5040 × 3000 px wall-row file lies 1:1 on the walls above the bottom strip — the placement the app computes
    // for it (getPrintFilePlacement) against the sheet area without the glue flap.
    const config2 = JSON.parse(CONFIGS['/public/demo4/config.json']);
    expect(config2.sheetLayers[0].placement).toEqual(getPrintFilePlacement(c, { width: 5040, height: 3000 }));
  });

  it('Demo 3: gusseted bag 250 + 100 × 320, greaseproof 50 g/m², rectangular window 140 × 190 mm from 105 mm, whole-bag layer', async () => {
    await loadDemoConfiguration(3, '/');
    const c = config();
    expect(c.productType).toBe('FOLDED');
    expect(getArtworkLayout(c)).toBe('WRAP');
    expect(getWrapLayers(c).map((layer) => layer.artwork.fileUrl)).toEqual(['/demo3/image-1.webp']);
    expect(c.dimensions).toEqual({ width: 250, height: 320, depth: 100 });
    expect(c.paper).toMatchObject({ type: 'GREASEPROOF', grammage: 50 });
    // Loaded exactly as written: the window fits the bag, so sanitizing clamps nothing.
    expect(c.window).toEqual({ type: 'RECTANGLE', material: 'PP_PERFORATED', width: 140, height: 190, bottomOffset: 105, filmOverlap: 20 });
    expect(c.glueFlapWidth).toBe(20);
    expect(c.bottomFoldDepth).toBe(15);
  });

  it('Demo 1: XL block-bottom bag 320 × 220 × 400, white kraft 70 g/m², twisted handle, whole-sheet layer', async () => {
    await loadDemoConfiguration(1, '/');
    const c = config();
    expect(c.productType).toBe('BLOCK');
    expect(c.dimensions).toEqual({ width: 320, height: 400, depth: 220 });
    expect(c.paper).toMatchObject({ color: 'WHITE', grammage: 70 });
    expect(c.handle?.type).toBe('TWISTED_PAPER');
    expect(getArtworkLayout(c)).toBe('SHEET');
    expect(getSheetLayers(c).map((layer) => layer.artwork.fileUrl)).toEqual(['/demo1/image-1.webp']);
    // Client placement against the sheet area without the glue flap: centred horizontally, 36.4 mm up (kept as written).
    const placement = getSheetLayers(c)[0].placement;
    expect(placement).toMatchObject({ mode: 'CUSTOM', offsetX: 0, scale: 1, rotation: 0, extendToBottom: true });
    expect(placement.mode === 'CUSTOM' && placement.offsetY).toBeCloseTo(36.375, 3);
  });

  it('still loads the configuration when an image is missing, and lists it', async () => {
    failingImages = ['image-2.webp'];
    const result = await loadDemoConfiguration(2, '/');
    expect(result).toEqual({ missing: ['demo2/image-2.webp'], total: 4 });
    expect(config().panels.BACK.artwork).toBeNull();
    expect(config().panels.FRONT.artwork).not.toBeNull();
  });

  it('Demo 5: block-bottom bag 220 × 110 × 300, brown recycled 100 g/m² FSC, flat handle, background + 2 logos (client)', async () => {
    const result = await loadDemoConfiguration(5, '/');
    expect(result).toEqual({ missing: [], total: 2 }); // background + one logo file used by two layers
    const c = config();
    expect(c.productType).toBe('BLOCK');
    expect(c.dimensions).toEqual({ width: 220, height: 300, depth: 110 });
    expect(c.paper).toMatchObject({ type: 'RECYCLED', color: 'BROWN', grammage: 100, fscCertified: true });
    expect(c.handle?.type).toBe('FLAT_PAPER');
    expect(getArtworkLayout(c)).toBe('WRAP');
    const layers = getWrapLayers(c);
    expect(layers.map((layer) => layer.artwork.fileUrl)).toEqual(['/demo5/image-1.webp', '/demo5/image-2.png', '/demo5/image-2.png']);
    // Background stretched around the bag and onto the bottom; the two logos placed by hand (kept as written).
    expect(layers[0].placement).toEqual({ mode: 'FILL', extendToBottom: true });
    expect(layers[1].placement).toMatchObject({ mode: 'CUSTOM', rotation: 0, extendToBottom: false });
    expect(layers[1].placement.mode === 'CUSTOM' && layers[1].placement.scale).toBeCloseTo(0.4509, 4);
    expect(layers[2].placement.mode === 'CUSTOM' && layers[2].placement.offsetX).toBeCloseTo(219.497, 3);
  });

  it('throws when the demo folder has no config.json', async () => {
    await expect(loadDemoConfiguration(9, '/')).rejects.toBeInstanceOf(DemoLoadError);
  });
});
