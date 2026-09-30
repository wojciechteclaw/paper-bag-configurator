import { mapArtworks, sanitizeConfiguration } from '../../domain/project';
import type { Artwork } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

// Demos are data, not code (client, 30.09.2026): every demo is a folder `public/demo<N>/` with
// - `config.json` — a bag configuration exactly as the app writes it (Podsumowanie → "Kopiuj JSON", or a project's
//   configuration), whose artwork `fileUrl`s are file names in the same folder, and
// - the images it references: `image-1.webp`, `image-2.webp`, … .
// Loading resolves the file names, reads each image's real pixel size, validates the configuration like a project
// file (`sanitizeConfiguration`: invalid values are clamped) and replaces the current configuration. Images that
// cannot be loaded are left out (the slot stays empty / the layer is dropped) and listed in the result.

/** Demo folders `public/demo1` … `public/demo<DEMO_COUNT>` — one header button each. */
export const DEMO_COUNT = 3;

/** Folder of demo `index`, relative to `public/`. */
export const demoFolder = (index: number) => `demo${index}`;

type ImageInfo = { width: number; height: number; sizeBytes: number; mimeType: string };

const MIME_BY_EXTENSION: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** Pixel size (and byte size, when the server reports it) of a public image; rejects when it cannot be loaded. */
async function probeImage(url: string): Promise<ImageInfo> {
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`Demo image could not be loaded: ${url}`));
    image.src = url;
  });
  let sizeBytes = 0;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    sizeBytes = Number(response.headers.get('content-length')) || 0;
  } catch {
    // Size is informational only.
  }
  const extension = url.split('.').pop()?.toLowerCase() ?? '';
  return { ...size, sizeBytes, mimeType: MIME_BY_EXTENSION[extension] ?? 'image/png' };
}

/** A file name in the demo folder (not an absolute URL / path). */
const isLocalFile = (fileUrl: string) => !/^([a-z]+:|\/)/i.test(fileUrl);

/** What a demo load could not apply: image paths (relative to `public/`) that failed to load. */
export type DemoLoadResult = { missing: string[]; total: number };

/** Why a demo could not be loaded at all. */
export class DemoLoadError extends Error {}

/**
 * Loads demo `index` (`public/demo<index>/config.json` + its images) into the configuration store. Throws
 * `DemoLoadError` when the config is missing or invalid; missing images are skipped and listed in the result.
 */
export async function loadDemoConfiguration(index: number, base: string = import.meta.env.BASE_URL): Promise<DemoLoadResult> {
  const publicBase = base.endsWith('/') ? base : `${base}/`;
  const prefix = `${publicBase}${demoFolder(index)}/`;
  let raw: unknown;
  try {
    const response = await fetch(`${prefix}config.json`);
    if (!response.ok) throw new Error(String(response.status));
    raw = await response.json();
  } catch (error) {
    throw new DemoLoadError(`Demo ${index}: config.json could not be read (${String(error)})`);
  }

  // Resolve every referenced file once, then write the real URL and pixel size into each artwork slot.
  const urlOf = (artwork: Artwork) => (isLocalFile(artwork.fileUrl) ? `${prefix}${artwork.fileUrl}` : artwork.fileUrl);
  const files = new Map<string, Promise<ImageInfo | null>>();
  mapArtworks(raw, (artwork) => {
    const url = urlOf(artwork);
    if (!files.has(url)) files.set(url, probeImage(url).catch(() => null));
    return artwork;
  });
  const infos = new Map<string, ImageInfo | null>();
  await Promise.all([...files].map(async ([url, info]) => infos.set(url, await info)));
  const missing = [...infos]
    .filter(([, info]) => info === null)
    .map(([url]) => (url.startsWith(publicBase) ? url.slice(publicBase.length) : url));
  const resolved = mapArtworks(raw, (artwork) => {
    const url = urlOf(artwork);
    const info = infos.get(url);
    return info ? { ...artwork, fileUrl: url, ...info } : null;
  });

  const result = sanitizeConfiguration(resolved);
  if (!result.ok) throw new DemoLoadError(`Demo ${index}: invalid configuration (${result.error})`);
  useConfigurationStore.getState().replaceConfiguration(result.configuration);
  return { missing, total: files.size };
}
