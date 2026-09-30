import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSheetArtworkArea } from '../../../src/domain/artworkLayout';
import { getArtworkRect } from '../../../src/domain/artworkPlacement';
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

  it('loads the gusseted-bag demo: 150 + 60 × 250, brown 40 g/m² FSC, no handle, gussted.webp on the whole sheet', async () => {
    // A whole-sheet print file: 435 × 275 mm (2·150 + 2·60 + s 15 by H 250 + d 25) at ~305 dpi.
    class SheetImage extends LoadingImage {
      override naturalWidth = 5220;
      override naturalHeight = 3300;
    }
    vi.stubGlobal('Image', SheetImage);
    const result = await loadDemoConfiguration('/', 'FOLDED');
    expect(result).toEqual({ missing: [], total: 1 });
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual(DEMO_CONFIGURATIONS.FOLDED.dimensions);
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.paper).toMatchObject({ color: 'BROWN', grammage: 40, fscCertified: true });
    expect(c.handle).toBeNull();
    expect(c.artworkLayout).toBe('SHEET');
    expect(c.wrapLayers).toEqual([]);
    expect(c.sheetLayers).toHaveLength(1);
    expect(c.sheetLayers[0].artwork.fileUrl).toBe('/gusseted-bag/gussted.webp');
    expect(c.sheetLayers[0].placement).toEqual({ mode: 'FILL', extendToBottom: true });
    expect(getSheetArtworkArea(c)).toMatchObject({ width: 435, height: 275 });
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
    expect(result.missing).toEqual(DEMO_CONFIGURATIONS.FOLDED.sheetLayers?.map((layer) => layer.path));
    const c = useConfigurationStore.getState().configuration;
    expect(c.productType).toBe('FOLDED');
    expect(c.dimensions).toEqual({ width: 150, height: 250, depth: 60 });
    expect(c.sheetLayers).toEqual([]);
  });

  it('lays a wall-row-sized file (the 5040 × 3000 px wrap image) 1:1 over the walls instead of stretching it', async () => {
    class WrapImage extends LoadingImage {
      override naturalWidth = 5040;
      override naturalHeight = 3000;
    }
    vi.stubGlobal('Image', WrapImage);
    await loadDemoConfiguration('/', 'FOLDED');
    const c = useConfigurationStore.getState().configuration;
    const area = getSheetArtworkArea(c);
    const rect = getArtworkRect(area, c.sheetLayers[0].artwork, c.sheetLayers[0].placement, area);
    // Wall row: sheet x 0…420, y 25…275 (above the bottom strip d = 25).
    expect(rect.width).toBeCloseTo(420);
    expect(rect.height).toBeCloseTo(250);
    expect(rect.center.x).toBeCloseTo(210);
    expect(rect.center.y).toBeCloseTo(150);
  });
});
