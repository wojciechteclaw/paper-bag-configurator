import { describe, expect, it } from 'vitest';
import { getSampleSize, loadArtworkSample } from './sampleArtworkPixels';

describe('getSampleSize', () => {
  it('downscales to the max side keeping the aspect ratio', () => {
    expect(getSampleSize(2000, 1000, 256)).toEqual({ width: 256, height: 128 });
    expect(getSampleSize(300, 3000, 256)).toEqual({ width: 26, height: 256 });
  });

  it('never upscales and handles degenerate sizes', () => {
    expect(getSampleSize(100, 50, 256)).toEqual({ width: 100, height: 50 });
    expect(getSampleSize(0, 50, 256)).toEqual({ width: 0, height: 0 });
    expect(getSampleSize(5000, 1, 256)).toEqual({ width: 256, height: 1 });
  });
});

describe('loadArtworkSample', () => {
  it('caches per file URL and resolves to null when decoding is impossible', async () => {
    const artwork = { fileUrl: 'blob:missing', width: 0, height: 0 };
    const first = loadArtworkSample(artwork);
    expect(loadArtworkSample(artwork)).toBe(first);
    await expect(first).resolves.toBeNull();
  });
});
