// Shared fixtures of the project-file tests (domain, state and UI).

import { createArtwork, createConfiguration, createHandle, createWrapLayer } from '../factories';
import type { Artwork, BagConfiguration } from '../types';

/** Minimal byte strings recognised by `sniffImageMimeType` (not decodable images; the format never decodes). */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]);
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 5, 5]);

export const fixtureArtwork = (name: string, mimeType: string, width = 1200, height = 800): Artwork =>
  createArtwork({ fileName: name, fileUrl: `blob:test/${name}`, mimeType, width, height, sizeBytes: 12 });

/**
 * A configuration using everything a project must restore: dimensions, white FSC paper, a flat handle, per-wall
 * artwork (one image shared by FRONT, LEFT and a wrap layer), a CUSTOM placement, whole-bag layers, print colours
 * with previews, colour-analysis settings and packaging. Valid as-is (loading it needs no adjustment).
 */
export function fixtureProject(): { configuration: BagConfiguration; files: Map<string, Uint8Array> } {
  const logo = fixtureArtwork('logo.png', 'image/png', 600, 600);
  const back = fixtureArtwork('back.jpg', 'image/jpeg');
  const wrap = fixtureArtwork('wrap.webp', 'image/webp', 2800, 800);
  const configuration = createConfiguration('BLOCK');
  configuration.dimensions = { width: 250, height: 300, depth: 100 };
  configuration.handle = createHandle('FLAT_PAPER');
  configuration.paper = { type: 'RECYCLED', color: 'WHITE', grammage: 100, fscCertified: true, moistureBarrier: false };
  configuration.panels.FRONT = {
    ...configuration.panels.FRONT,
    artwork: logo,
    placement: { mode: 'CUSTOM', offsetX: 20, offsetY: -15, scale: 0.5, rotation: 90, extendToBottom: false },
  };
  configuration.panels.BACK = { ...configuration.panels.BACK, artwork: back, placement: { mode: 'FILL', extendToBottom: true } };
  configuration.panels.LEFT = { ...configuration.panels.LEFT, artwork: logo };
  configuration.artworkLayout = 'WRAP';
  configuration.wrapLayers = [
    createWrapLayer(wrap, { mode: 'FILL', extendToBottom: true }),
    createWrapLayer(logo, { mode: 'CUSTOM', offsetX: -100, offsetY: 10, scale: 0.3, rotation: 0, extendToBottom: false }),
  ];
  configuration.print = {
    technology: 'FLEXO',
    pantoneColors: [
      { code: 'PMS 186 C', hex: '#c8102e' },
      { code: 'Black C', hex: '#2d2926' },
    ],
    colorAnalysis: { mergeTolerance: 12, minAreaShare: 0.01 },
  };
  configuration.packaging = 'FOIL';
  const files = new Map<string, Uint8Array>([
    [logo.id, PNG_BYTES],
    [back.id, JPEG_BYTES],
    [wrap.id, WEBP_BYTES],
  ]);
  return { configuration, files };
}

/** The configuration with every artwork `fileUrl` blanked (they are regenerated on load). */
export function withoutFileUrls<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === 'fileUrl' ? '' : v))) as T;
}
