import { describe, expect, it } from 'vitest';
import { buildDieline } from '../../../src/domain/dieline';
import { resolvePanelArtworks } from '../../../src/domain/artworkLayout';
import { createArtwork, createConfiguration, createWrapLayer } from '../../../src/domain/factories';
import { computeArtworkPalette } from '../../../src/domain/printCoverage/artworkPalette';
import { computeInkCoverage, type CoveragePanelInput } from '../../../src/domain/printCoverage/computeInkCoverage';
import type { BagWindow } from '../../../src/domain/types';

// A solid red FILL over FRONT (140 × 370) of the gusseted bag; the window opening is cut from the paper, so its area
// carries no ink (docs/SPEC.md §2b).
const dimensions = { width: 140, height: 370, depth: 90 };
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'PP', width: 40, filmOverlap: 10 };
const red: CoveragePanelInput = {
  imageSize: { width: 2, height: 2 },
  placement: { mode: 'FILL', extendToBottom: false },
  sample: { width: 2, height: 2, data: Uint8ClampedArray.from(Array.from({ length: 4 }, () => [200, 16, 46, 255]).flat()) },
};
const pantoneColors = [{ code: 'PMS 186 C', hex: '#c8102e' }];
const coverage = (window: BagWindow | null) =>
  computeInkCoverage({
    dieline: buildDieline({ ...createConfiguration('FOLDED'), dimensions, window }),
    panels: { FRONT: red },
    paperColor: 'WHITE',
    pantoneColors,
    rules: { gridCellsLongSide: 370 }, // 1 mm cells: the opening edges fall on cell borders
  });

describe('ink coverage with a window', () => {
  const full = 140 * 370;

  it('skips the rectangular opening (ink and wall area)', () => {
    const result = coverage(rectangle);
    expect(coverage(null).inkArea).toBeCloseTo(full, 3);
    expect(result.inkArea).toBeCloseTo(full - 60 * 100, 3);
    expect(result.panels.FRONT?.wallArea).toBeCloseTo(full - 60 * 100, 6);
    expect(result.panels.FRONT?.printArea).toBeCloseTo(full - 60 * 100, 6);
  });

  it('skips the panoramic strip up to the mouth', () => {
    expect(coverage(panoramic).inkArea).toBeCloseTo(full - 40 * 330, 3);
  });

  it('skips the opening for a whole-sheet (SHEET) layer too', () => {
    const configuration = { ...createConfiguration('FOLDED'), dimensions, window: rectangle, artworkLayout: 'SHEET' as const };
    configuration.sheetLayers = [createWrapLayer(
      createArtwork({ fileName: 's.png', fileUrl: 'blob:s', mimeType: 'image/png', width: 2, height: 2, sizeBytes: 1 }),
      { mode: 'FILL', extendToBottom: true },
    )];
    const resolved = resolvePanelArtworks(configuration);
    const front: CoveragePanelInput = { ...red, placement: resolved.FRONT.layers[0].placement, area: resolved.FRONT.layers[0].area };
    const dieline = buildDieline(configuration);
    const result = computeInkCoverage({ dieline, panels: { FRONT: front }, paperColor: 'WHITE', pantoneColors, rules: { gridCellsLongSide: 370 } });
    // FRONT wall + its bottom strip d, minus the opening.
    expect(result.inkArea).toBeCloseTo(140 * (370 + dieline.bottomLineY) - 60 * 100, 3);
  });

  it('leaves the opening out of the artwork palette too', () => {
    const palette = computeArtworkPalette({
      dieline: buildDieline({ ...createConfiguration('FOLDED'), dimensions, window: rectangle }),
      panels: { FRONT: red },
      paperColor: 'WHITE',
      pantoneColors,
      rules: { gridCellsLongSide: 370 },
    });
    const total = palette.colors.reduce((sum, color) => sum + color.area, 0);
    expect(total).toBeCloseTo(full - 60 * 100, 3);
  });
});
