import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { DEMO_CONFIGURATION, DEMO_CONFIGURATIONS, loadDemoConfiguration } from '../../../src/ui/demo/demoConfiguration';

// jsdom never decodes images: a stub Image that "loads" with a fixed size.
class LoadingImage {
  naturalWidth = 2953;
  naturalHeight = 6083;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  vi.stubGlobal('Image', LoadingImage);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { headers: { 'content-length': '1234' } })));
});
afterEach(() => vi.unstubAllGlobals());

describe('demo configuration', () => {
  it('loads 250 × 200 × 400 mm, white 100 g/m² FSC, twisted rope handle and the wave artwork extended to the bottom', async () => {
    await loadDemoConfiguration('/');
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('BLOCK');
    expect(c.dimensions).toEqual({ width: 250, height: 400, depth: 200 });
    expect(c.paper).toMatchObject({ color: 'WHITE', grammage: 100, fscCertified: true });
    expect(c.handle?.type).toBe(DEMO_CONFIGURATION.handle);
    for (const position of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
      const panel = c.panels[position];
      expect(panel.artwork?.fileUrl).toBe(`/carrier-bag/wave_${position.toLowerCase()}.webp`);
      expect(panel.artwork).toMatchObject({ width: 2953, height: 6083, sizeBytes: 1234, mimeType: 'image/webp' });
      expect(panel.placement).toMatchObject({ mode: 'FILL', extendToBottom: true });
    }
  });

  it('loads the gusseted-bag demo: 150 + 60 × 250, brown 40 g/m² FSC, no handle, one whole-bag layer gussted.webp', async () => {
    const result = await loadDemoConfiguration('/', 'FOLDED');
    expect(result).toEqual({ missing: [], total: 1 });
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual(DEMO_CONFIGURATIONS.FOLDED.dimensions);
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.paper).toMatchObject({ color: 'BROWN', grammage: 40, fscCertified: true });
    expect(c.handle).toBeNull();
    expect(c.artworkLayout).toBe('WRAP');
    expect(c.wrapLayers).toHaveLength(1);
    expect(c.wrapLayers[0].artwork.fileUrl).toBe('/gusseted-bag/gussted.webp');
    expect(c.wrapLayers[0].placement).toMatchObject({ mode: 'CUSTOM', offsetX: -60, offsetY: 0, scale: 1, rotation: 0, extendToBottom: false });
    expect(c.glueFlapWidth).toBe(15);
    for (const position of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) expect(c.panels[position].artwork).toBeNull();
  });

  it('still loads the configuration when demo images are missing, and lists them', async () => {
    class FailingImage extends LoadingImage {
      override set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);
    const result = await loadDemoConfiguration('/', 'FOLDED');
    expect(result.total).toBe(1);
    expect(result.missing).toEqual(DEMO_CONFIGURATIONS.FOLDED.wrapLayers?.map((layer) => layer.path));
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.wrapLayers).toEqual([]);
  });
});
