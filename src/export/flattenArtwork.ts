// Flattens artwork with transparency onto the paper colour before it goes into a PDF (product sheet and dieline PDF).
// jsPDF / svg2pdf.js mishandle alpha (transparent pixels are stored as black with alpha 0 and show up black) and do
// not read WEBP, so every embedded image is composited over the bag's paper colour (`PAPER_PREVIEW_COLORS`, the same
// colour as the 3D paper) and re-encoded as PNG (sharp graphics) or JPEG when that is much smaller (photos).
// The SVG export keeps the original images with alpha.

import { embedImages } from '../dieline/exportSvg';
import type { DielineScene } from '../dieline/scene';
import { PAPER_PREVIEW_COLORS } from '../domain/config/productCatalog';
import { hexToRgb, type Rgb } from '../domain/printCoverage';
import type { PaperColor } from '../domain/types';

/** Alpha-composites RGBA pixels over an opaque background colour, in place (result is fully opaque). Pure. */
export function flattenRgbaOnColor(data: Uint8ClampedArray, background: Rgb): Uint8ClampedArray {
  for (let o = 0; o < data.length; o += 4) {
    const alpha = data[o + 3] / 255;
    if (alpha >= 1) continue;
    const k = 1 - alpha;
    data[o] = Math.round(data[o] * alpha + background.r * k);
    data[o + 1] = Math.round(data[o + 1] * alpha + background.g * k);
    data[o + 2] = Math.round(data[o + 2] * alpha + background.b * k);
    data[o + 3] = 255;
  }
  return data;
}

export type FlattenOptions = {
  /** Long side cap of the re-encoded image, px (default 3000 ≈ 190 dpi on a 400 mm wall). */
  maxSidePx?: number;
  /** PNG data URLs above this size (bytes of the data URL) are also tried as JPEG; the smaller one wins. */
  pngBudgetBytes?: number;
  jpegQuality?: number;
};

async function decode(href: string): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(await (await fetch(href)).blob());
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall back to <img>
    }
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = href;
  await image.decode();
  return { source: image, width: image.naturalWidth, height: image.naturalHeight };
}

/** Decodes an image URL (blob:, data:, http:), composites it over `paperHex` and returns an opaque PNG / JPEG data URL. */
export async function flattenImageToDataUrl(href: string, paperHex: string, options: FlattenOptions = {}): Promise<string> {
  const { maxSidePx = 3000, pngBudgetBytes = 1_500_000, jpegQuality = 0.9 } = options;
  const background = hexToRgb(paperHex) ?? { r: 255, g: 255, b: 255 };
  const image = await decode(href);
  try {
    const k = Math.min(1, maxSidePx / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * k));
    const height = Math.max(1, Math.round(image.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas not available');
    context.clearRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    flattenRgbaOnColor(pixels.data, background);
    context.putImageData(pixels, 0, 0);
    const png = canvas.toDataURL('image/png');
    if (png.length <= pngBudgetBytes) return png;
    const jpeg = canvas.toDataURL('image/jpeg', jpegQuality);
    return jpeg.length < png.length ? jpeg : png;
  } finally {
    image.close?.();
  }
}

/**
 * PDF-ready hrefs of the given images (href → opaque data URL on the paper colour). Images that cannot be decoded are
 * left out (the caller then keeps / drops the original href).
 */
export async function flattenImagesForPdf(
  hrefs: readonly string[],
  paperColor: PaperColor,
  options?: FlattenOptions,
): Promise<Record<string, string>> {
  const paperHex = PAPER_PREVIEW_COLORS[paperColor];
  const unique = [...new Set(hrefs)];
  const entries = await Promise.all(
    unique.map(async (href) => {
      try {
        return [href, await flattenImageToDataUrl(href, paperHex, options)] as const;
      } catch (error) {
        console.warn('Artwork could not be flattened for the PDF', error);
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

/**
 * PDF-ready image hrefs of a dieline scene: artwork flattened onto the paper colour; images that cannot be flattened
 * fall back to their plain embedded data URL.
 */
export async function embedSceneImagesForPdf(scene: DielineScene, paperColor: PaperColor): Promise<Record<string, string>> {
  const flattened = await flattenImagesForPdf(
    scene.images.map((image) => image.href),
    paperColor,
  );
  const missing = scene.images.some((image) => !flattened[image.href]);
  return missing ? { ...(await embedImages(scene)), ...flattened } : flattened;
}
