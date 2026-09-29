import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../domain/factories';
import { useConfigurationStore } from '../../state/configurationStore';
import { DEMO_CONFIGURATION, loadDemoConfiguration } from './demoConfiguration';

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
      expect(panel.artwork?.fileUrl).toBe(`/sample-images/wave_${position.toLowerCase()}.webp`);
      expect(panel.artwork).toMatchObject({ width: 2953, height: 6083, sizeBytes: 1234, mimeType: 'image/webp' });
      expect(panel.placement).toMatchObject({ mode: 'FILL', extendToBottom: true });
    }
  });
});
