import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../domain/factories';
import { useConfigurationStore } from '../../state/configurationStore';
import { DEMO_CONFIGURATION, DEMO_CONFIGURATIONS, loadDemoConfiguration } from './demoConfiguration';

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

  it('loads the gusseted-bag demo: client example 140 + 90 × 370, brown 40 g/m² FSC, no handle, public/gusseted-bag images', async () => {
    const result = await loadDemoConfiguration('/', 'FOLDED');
    expect(result).toEqual({ missing: [], total: 4 });
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual(DEMO_CONFIGURATIONS.FOLDED.dimensions);
    expect(c.dimensions).toEqual({ width: 140, height: 370, depth: 90 });
    expect(c.paper).toMatchObject({ color: 'BROWN', grammage: 40, fscCertified: true });
    expect(c.handle).toBeNull();
    for (const position of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
      expect(c.panels[position].artwork?.fileUrl).toBe(`/gusseted-bag/${position.toLowerCase()}.webp`);
      expect(c.panels[position].placement).toEqual({ mode: 'FILL', extendToBottom: false });
    }
  });

  it('still loads the configuration when demo images are missing, and lists them', async () => {
    class FailingImage extends LoadingImage {
      override set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);
    const result = await loadDemoConfiguration('/', 'FOLDED');
    expect(result.total).toBe(4);
    expect(result.missing).toEqual(Object.values(DEMO_CONFIGURATIONS.FOLDED.artwork));
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual({ width: 140, height: 370, depth: 90 });
    expect(c.panels.FRONT.artwork).toBeNull();
  });
});
