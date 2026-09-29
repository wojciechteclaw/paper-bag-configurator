// UI adapter: decodes artwork into small RGBA pixel samples for the ink-coverage estimate (docs/SPEC.md §4d).
// Each file URL is decoded once, downscaled to at most `sampleMaxSidePx` on the long side, and cached.

import { PRINT_COVERAGE_RULES } from '../../domain/config/productCatalog';
import type { PixelSample } from '../../domain/printCoverage';
import type { Artwork } from '../../domain/types';

const cache = new Map<string, Promise<PixelSample | null>>();

/** Sample size keeping the aspect ratio, long side ≤ maxSide (never upscaled). */
export function getSampleSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

type Drawable = CanvasImageSource;

function readPixels(source: Drawable, width: number, height: number): PixelSample | null {
  let context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas === 'function') {
    context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context) return null;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** Decodes off the main thread where possible (`createImageBitmap` with resize), else via an <img>. */
async function decode(fileUrl: string, width: number, height: number): Promise<PixelSample | null> {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      const blob = await (await fetch(fileUrl)).blob();
      const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
      try {
        return readPixels(bitmap, width, height);
      } finally {
        bitmap.close();
      }
    } catch {
      // fall through to the <img> path
    }
  }
  if (typeof Image !== 'function') return null;
  const image = new Image();
  image.decoding = 'async';
  image.src = fileUrl;
  await image.decode();
  return readPixels(image, width, height);
}

/** Cached pixel sample of an artwork; resolves to null when the image cannot be decoded (e.g. in tests). */
export function loadArtworkSample(
  artwork: Pick<Artwork, 'fileUrl' | 'width' | 'height'>,
  maxSide: number = PRINT_COVERAGE_RULES.sampleMaxSidePx,
): Promise<PixelSample | null> {
  const key = `${artwork.fileUrl}|${maxSide}`;
  let pending = cache.get(key);
  if (!pending) {
    const size = getSampleSize(artwork.width, artwork.height, maxSide);
    pending =
      size.width > 0
        ? decode(artwork.fileUrl, size.width, size.height).catch(() => null)
        : Promise.resolve(null);
    cache.set(key, pending);
  }
  return pending;
}

/** Drops cached samples of artwork that is no longer used (replaced / removed). */
export function pruneArtworkSamples(usedFileUrls: ReadonlySet<string>) {
  for (const key of cache.keys()) {
    if (!usedFileUrls.has(key.slice(0, key.lastIndexOf('|')))) cache.delete(key);
  }
}
