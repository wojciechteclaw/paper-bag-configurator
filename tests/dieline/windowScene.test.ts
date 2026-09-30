import { describe, expect, it } from 'vitest';
import { resolvePanelArtworks } from '../../src/domain/artworkLayout';
import { buildDieline } from '../../src/domain/dieline';
import { createArtwork, createConfiguration, createWrapLayer } from '../../src/domain/factories';
import type { BagConfiguration, BagWindow } from '../../src/domain/types';
import { buildDielineSvg } from '../../src/dieline/exportSvg';
import { buildDielineScene, clipPathData, isPointOnSceneImage } from '../../src/dieline/scene';

// Gusseted 140 + 90 × 370: sheet 475 × 395, SVG y = 395 − sheet y. Rectangle opening sheet x ∈ [130, 190],
// y ∈ [175, 275] → SVG y ∈ [120, 220]. Panoramic opening x ∈ [140, 180] from sheet y = 65 up through the top edge.
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'CELLULOSE', width: 40, filmOverlap: 10 };
const artwork = createArtwork({ fileName: 'a.png', fileUrl: 'blob:a', mimeType: 'image/png', width: 1000, height: 1000, sizeBytes: 1 });

function sceneOf(window: BagWindow | null, wrap = false) {
  const configuration: BagConfiguration = { ...createConfiguration('FOLDED'), window };
  if (wrap) {
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = [createWrapLayer(artwork)];
  } else {
    configuration.panels.FRONT.artwork = artwork;
  }
  return buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
    label: (key) => key,
    dimension: (key, value) => `${key}=${value}`,
  });
}

describe('dieline scene with a window', () => {
  it('cuts the opening out of the FRONT artwork clip (even-odd path) and lists the window', () => {
    const scene = sceneOf(rectangle);
    const front = scene.images.find((image) => image.panel === 'FRONT')!;
    expect(front.clipHoles).toEqual([{ id: 'hole-FRONT-1', x: 130, y: 120, width: 60, height: 100 }]);
    expect(clipPathData(front)).toMatch(/Z M130 120 H190 V220 H130 Z$/);
    expect(scene.windows).toEqual([
      {
        id: 'window',
        opening: { id: 'window-opening', x: 130, y: 120, width: 60, height: 100 },
        film: { id: 'window-film', x: 120, y: 110, width: 80, height: 120 },
        openAtTop: false,
        filmOverlap: 10,
      },
    ]);
    // Picking: the opening is not part of the image.
    expect(isPointOnSceneImage(front, [160, 170])).toBe(false);
    expect(isPointOnSceneImage(front, [110, 170])).toBe(true);
  });

  it('extends a panoramic hole over the bleed above the top edge', () => {
    const front = sceneOf(panoramic).images.find((image) => image.panel === 'FRONT')!;
    // Sheet y 65 … 398 (top + bleed) → SVG y −3 … 330.
    expect(front.clipHoles).toEqual([{ id: 'hole-FRONT-1', x: 140, y: -3, width: 40, height: 333 }]);
  });

  it('keeps the holes on a merged whole-bag layer', () => {
    const wrap = sceneOf(rectangle, true).images.filter((image) => image.segment === 'WRAP');
    expect(wrap.flatMap((image) => image.clipHoles ?? [])).toEqual([{ id: 'hole-FRONT-1', x: 130, y: 120, width: 60, height: 100 }]);
  });

  it('exports the U notch, the even-odd clip, the tinted opening and the dashed film zone to SVG', () => {
    const svg = buildDielineSvg(sceneOf(panoramic));
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const clip = doc.querySelector('clipPath path');
    expect(clip?.getAttribute('clip-rule')).toBe('evenodd');
    expect(doc.querySelector('[data-zone="WINDOW_OPENING"]')).not.toBeNull();
    expect(doc.querySelector('[data-zone="WINDOW_FILM"]')?.getAttribute('stroke-dasharray')).toBeTruthy();
    // The cut outline runs down into the notch: sheet (180, 65) → SVG (180, 330).
    expect(doc.getElementById('cut-1')?.getAttribute('d')).toContain('180 330 L140 330');
  });

  it('leaves the scene of a bag without a window as before', () => {
    const scene = sceneOf(null);
    expect(scene.windows).toEqual([]);
    expect(scene.images.every((image) => image.clipHoles === undefined)).toBe(true);
  });
});
