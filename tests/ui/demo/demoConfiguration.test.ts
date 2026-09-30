import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import { getArtworkLayout, getSheetLayers, getWrapLayers } from '../../../src/domain/artworkLayout';
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
  it('has four demos, each with a config.json', () => {
    expect(DEMO_COUNT).toBe(4);
    for (let i = 1; i <= DEMO_COUNT; i++) expect(CONFIGS[`/public/demo${i}/config.json`]).toBeDefined();
  });

  it('Demo 4: block-bottom bag 180 × 180 × 400, brown recycled 80 g/m² FSC, flat paper handle, wave artwork on all walls extended to the bottom', async () => {
    const result = await loadDemoConfiguration(4, '/');
    expect(result).toEqual({ missing: [], total: 4 });
    const c = config();
    expect(c.productType).toBe('BLOCK');
    // Loaded as written: 180 × 180 is valid (depth ≤ width), so sanitizing clamps nothing.
    expect(c.dimensions).toEqual({ width: 180, height: 400, depth: 180 });
    expect(c.paper).toMatchObject({ type: 'RECYCLED', color: 'BROWN', grammage: 80, fscCertified: true });
    expect(c.handle?.type).toBe('FLAT_PAPER');
    (['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const).forEach((position, i) => {
      expect(c.panels[position].artwork).toMatchObject({ fileUrl: `/demo4/image-${i + 1}.webp`, width: 2000, height: 1000, sizeBytes: 1234 });
      expect(c.panels[position].placement).toMatchObject({ mode: 'FILL', extendToBottom: true });
    });
  });

  it('Demo 2: gusseted bag 150 + 60 × 250, one whole-sheet layer image-1', async () => {
    await loadDemoConfiguration(2, '/');
    const c = config();
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.glueFlapWidth).toBe(15);
    expect(getArtworkLayout(c)).toBe('SHEET');
    expect(getSheetLayers(c).map((layer) => layer.artwork.fileUrl)).toEqual(['/demo2/image-1.webp']);
  });

  it('Demo 3: gusseted bag 250 + 100 × 320, greaseproof 50 g/m², panoramic window 140 mm from 105 mm, whole-bag layer', async () => {
    await loadDemoConfiguration(3, '/');
    const c = config();
    expect(c.productType).toBe('FOLDED');
    expect(getArtworkLayout(c)).toBe('WRAP');
    expect(getWrapLayers(c).map((layer) => layer.artwork.fileUrl)).toEqual(['/demo3/image-1.webp']);
    expect(c.dimensions).toEqual({ width: 250, height: 320, depth: 100 });
    expect(c.paper).toMatchObject({ type: 'GREASEPROOF', grammage: 50 });
    expect(c.window).toMatchObject({ type: 'PANORAMIC', material: 'PP_PERFORATED', width: 140, bottomOffset: 105 });
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
  });

  it('still loads the configuration when an image is missing, and lists it', async () => {
    failingImages = ['image-2.webp'];
    const result = await loadDemoConfiguration(4, '/');
    expect(result).toEqual({ missing: ['demo4/image-2.webp'], total: 4 });
    expect(config().panels.BACK.artwork).toBeNull();
    expect(config().panels.FRONT.artwork).not.toBeNull();
  });

  it('throws when the demo folder has no config.json', async () => {
    await expect(loadDemoConfiguration(9, '/')).rejects.toBeInstanceOf(DemoLoadError);
  });
});
