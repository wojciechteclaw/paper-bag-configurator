import { describe, expect, it } from 'vitest';
import { getArtworkBottomAllowance } from '../../src/domain/artworkAllowance';
import { getWrapArtworkArea, resolvePanelArtwork } from '../../src/domain/artworkLayout';
import { getPanelArtworkArea } from '../../src/domain/artworkPlacement';
import { BAG_TYPES } from '../../src/domain/config/productCatalog';
import { buildDieline, getArtworkClipRect } from '../../src/domain/dieline';
import { createArtwork, createConfiguration } from '../../src/domain/factories';
import { getBottomAllowance } from '../../src/domain/geometry/tube';

// "Extend to bottom" on the gusseted bag (client [K] 30.09.2026): the allowance is the bottom strip d.
const dimensions = { width: 140, height: 370, depth: 90 };
const artwork = createArtwork({ fileName: 'a.png', fileUrl: 'blob:a', mimeType: 'image/png', width: 100, height: 200, sizeBytes: 10 });

describe('bottom allowance per bag type', () => {
  it('is the block zone (D + 30) / 2 for the block bottom and the strip d for the gusseted bag', () => {
    expect(getArtworkBottomAllowance(dimensions)).toBe(getBottomAllowance(dimensions));
    expect(getArtworkBottomAllowance({ dimensions, productType: 'BLOCK' })).toBe(60);
    expect(getArtworkBottomAllowance({ dimensions, productType: 'FOLDED' })).toBe(25);
    expect(getArtworkBottomAllowance({ dimensions, productType: 'FOLDED', bottomFoldDepth: 15 })).toBe(15);
    expect(BAG_TYPES.FOLDED.extendToBottomAvailable).toBe(true);
  });

  it('extends wall and whole-bag artwork areas by d on the gusseted bag', () => {
    const geometry = { dimensions, productType: 'FOLDED' as const, bottomFoldDepth: 30 };
    expect(getPanelArtworkArea('FRONT', geometry, { extendToBottom: true })).toEqual({ x: 0, y: -30, width: 140, height: 400 });
    expect(getPanelArtworkArea('LEFT', geometry, { extendToBottom: false })).toEqual({ x: 0, y: 0, width: 90, height: 370 });
    expect(getWrapArtworkArea(geometry, { extendToBottom: true })).toMatchObject({ y: -30, height: 400, width: 460 });
  });

  it('resolves a gusseted wall with "extend to bottom" over its strip, matching the dieline allowance and clip', () => {
    const base = createConfiguration('FOLDED');
    const configuration = {
      ...base,
      dimensions,
      bottomFoldDepth: 20,
      panels: { ...base.panels, BACK: { ...base.panels.BACK, artwork, placement: { mode: 'FILL' as const, extendToBottom: true } } },
    };
    const resolved = resolvePanelArtwork(configuration, 'BACK');
    expect(resolved.extendsToBottom).toBe(true);
    expect(resolved.layers[0].area).toEqual({ x: 0, y: -20, width: 140, height: 390 });
    const dieline = buildDieline(configuration);
    expect(dieline.allowance).toBe(20);
    const back = dieline.segments.find((segment) => segment.panel === 'BACK')!;
    // The artwork clip reaches down over the strip (to the bleed below the sheet), as for the block bottom.
    expect(getArtworkClipRect(dieline, back, true).y).toBeLessThan(0);
    expect(getArtworkClipRect(dieline, back, false).y).toBeGreaterThan(0);
  });
});
