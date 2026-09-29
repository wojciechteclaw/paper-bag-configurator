import { describe, expect, it } from 'vitest';
import { PAPER_PREVIEW_COLORS } from '../domain/config/productCatalog';
import { hexToRgb } from '../domain/printCoverage';
import { flattenRgbaOnColor } from './flattenArtwork';

const pixels = (data: Uint8ClampedArray) => Array.from({ length: data.length / 4 }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 4)));

describe('flattenRgbaOnColor', () => {
  it('turns transparent (black, alpha 0) pixels into the paper colour and keeps opaque ones', () => {
    for (const paper of ['WHITE', 'BROWN'] as const) {
      const { r, g, b } = hexToRgb(PAPER_PREVIEW_COLORS[paper])!;
      const data = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 200, 16, 46, 255]);
      flattenRgbaOnColor(data, { r, g, b });
      expect(pixels(data)).toEqual([
        [r, g, b, 255],
        [r, g, b, 255],
        [200, 16, 46, 255],
      ]);
    }
  });

  it('alpha-composites semi-transparent pixels over the paper', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 51]); // black at 20 %
    flattenRgbaOnColor(data, { r: 244, g: 242, b: 236 });
    expect(pixels(data)).toEqual([[Math.round(244 * 0.8), Math.round(242 * 0.8), Math.round(236 * 0.8), 255]]);
  });

  it('uses the same paper colours as the 3D preview', () => {
    expect(PAPER_PREVIEW_COLORS).toEqual({ WHITE: '#f4f2ec', BROWN: '#b88a5a' });
  });
});
