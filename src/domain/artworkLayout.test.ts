import { describe, expect, it } from 'vitest';
import {
  getActiveArtworkTargets,
  getArtworkLayout,
  getArtworkTargetArea,
  getArtworkTargetSize,
  getWrapArtwork,
  getWrapArtworkArea,
  getWrapPanelOffset,
  hasActiveArtwork,
  resolvePanelArtwork,
  resolvePanelArtworks,
  WRAP_PANEL_ORDER,
} from './artworkLayout';
import { computePanelUvTransform, containPlacement, fillPlacement, getPanelArtworkArea } from './artworkPlacement';
import { buildDieline } from './dieline';
import { createArtwork, createConfiguration } from './factories';
import { getPanelSize } from './panels';
import type { BagConfiguration, PanelPosition } from './types';

const artwork = (name: string, width = 1400, height = 800) =>
  createArtwork({ fileName: name, fileUrl: `blob:${name}`, mimeType: 'image/png', width, height, sizeBytes: 1 });

/** 200 × 400 × 150 (W × H × D): wall row 700 mm, allowance a = 90 mm. */
function wrapConfiguration(extendToBottom = false): BagConfiguration {
  const configuration = createConfiguration('BLOCK');
  configuration.artworkLayout = 'WRAP';
  configuration.wrapArtwork = { artwork: artwork('wrap'), placement: fillPlacement(extendToBottom) };
  return configuration;
}

/** Texture coordinate of panel-local point (x, y) — the three.js transform with centre (0, 0). */
function textureAt(configuration: BagConfiguration, position: PanelPosition, x: number, y: number): [number, number] {
  const resolved = resolvePanelArtwork(configuration, position);
  const size = getPanelSize(position, configuration.dimensions);
  const { repeat, offset, rotation } = computePanelUvTransform(size, resolved.artwork!, resolved.placement, resolved.area);
  const u = x / size.width;
  const v = y / size.height;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [repeat[0] * (c * u + s * v) + offset[0], repeat[1] * (-s * u + c * v) + offset[1]];
}

describe('wrap geometry', () => {
  it('runs over the walls in dieline sheet order, each wall starting where the previous one ends', () => {
    const { dimensions } = createConfiguration('BLOCK');
    const dieline = buildDieline({ dimensions, handle: null });
    expect(WRAP_PANEL_ORDER).toEqual(dieline.segments.map((segment) => segment.panel));
    for (const segment of dieline.segments) {
      expect(segment.localX0).toBe(0);
      expect(getWrapPanelOffset(segment.panel, dimensions)).toBe(segment.x0);
    }
    expect(WRAP_PANEL_ORDER.map((p) => getWrapPanelOffset(p, dimensions))).toEqual([0, 150, 350, 500]);
  });

  it('covers the whole wall row (glue flap excluded), plus the bottom allowance when extended', () => {
    const dimensions = { width: 200, height: 400, depth: 150 };
    expect(getWrapArtworkArea(dimensions, { extendToBottom: false })).toEqual({ x: 0, y: 0, width: 700, height: 400 });
    expect(getWrapArtworkArea(dimensions, { extendToBottom: true })).toEqual({ x: 0, y: -90, width: 700, height: 490 });
    expect(getArtworkTargetSize('WRAP', dimensions)).toEqual({ width: 700, height: 400 });
    expect(getArtworkTargetSize('LEFT', dimensions)).toEqual({ width: 150, height: 400 });
    expect(getArtworkTargetArea('FRONT', dimensions, { extendToBottom: true })).toEqual(
      getPanelArtworkArea('FRONT', dimensions, { extendToBottom: true }),
    );
  });
});

describe('resolvePanelArtwork', () => {
  it('returns each wall its own artwork and area in the per-wall layout (the default)', () => {
    const configuration = createConfiguration('BLOCK');
    configuration.panels.FRONT.artwork = artwork('front');
    configuration.wrapArtwork.artwork = artwork('kept-wrap');
    const resolved = resolvePanelArtworks(configuration);
    expect(resolved.FRONT).toMatchObject({ source: 'FRONT', artwork: configuration.panels.FRONT.artwork });
    expect(resolved.FRONT.area).toEqual({ x: 0, y: 0, width: 200, height: 400 });
    expect(resolved.BACK.artwork).toBeNull();
    expect(getActiveArtworkTargets(configuration)).toEqual(['LEFT', 'FRONT', 'RIGHT', 'BACK']);
  });

  it('gives every wall the wrap artwork over the wall row shifted into its own coordinates', () => {
    const configuration = wrapConfiguration();
    configuration.panels.FRONT.artwork = artwork('kept-front'); // inactive: not shown
    const resolved = resolvePanelArtworks(configuration);
    for (const position of WRAP_PANEL_ORDER) {
      expect(resolved[position]).toMatchObject({ source: 'WRAP', artwork: configuration.wrapArtwork.artwork });
      expect(resolved[position].placement).toBe(configuration.wrapArtwork.placement);
    }
    expect(resolved.LEFT.area).toEqual({ x: 0, y: 0, width: 700, height: 400 });
    expect(resolved.FRONT.area).toEqual({ x: -150, y: 0, width: 700, height: 400 });
    expect(resolved.RIGHT.area).toEqual({ x: -350, y: 0, width: 700, height: 400 });
    expect(resolved.BACK.area).toEqual({ x: -500, y: 0, width: 700, height: 400 });
    expect(getActiveArtworkTargets(configuration)).toEqual(['WRAP']);
  });

  it('maps a FILL wrap continuously across the wall edges: LEFT starts at t = 0, BACK ends at t = 1', () => {
    const configuration = wrapConfiguration();
    expect(textureAt(configuration, 'LEFT', 0, 0)).toEqual([0, 0]);
    expect(textureAt(configuration, 'BACK', 200, 400)[0]).toBeCloseTo(1);
    expect(textureAt(configuration, 'BACK', 200, 400)[1]).toBeCloseTo(1);
    // Right edge of each wall = left edge of the next one.
    for (let i = 0; i < WRAP_PANEL_ORDER.length - 1; i++) {
      const wall = WRAP_PANEL_ORDER[i];
      const next = WRAP_PANEL_ORDER[i + 1];
      const right = textureAt(configuration, wall, getPanelSize(wall, configuration.dimensions).width, 123);
      const left = textureAt(configuration, next, 0, 123);
      expect(right[0]).toBeCloseTo(left[0]);
      expect(right[1]).toBeCloseTo(left[1]);
    }
    // FRONT starts 150 mm into the 700 mm row.
    expect(textureAt(configuration, 'FRONT', 0, 0)[0]).toBeCloseTo(150 / 700);
  });

  it('extends a wrap over the bottom allowance of every wall (the image bottom at y = −a)', () => {
    const configuration = wrapConfiguration(true);
    for (const position of WRAP_PANEL_ORDER) {
      expect(resolvePanelArtwork(configuration, position).area).toMatchObject({ y: -90, height: 490 });
      expect(textureAt(configuration, position, 0, -90)[1]).toBeCloseTo(0);
    }
  });

  it('keeps a CUSTOM wrap placement centred on the whole row, not on each wall', () => {
    const configuration = wrapConfiguration();
    configuration.wrapArtwork.placement = containPlacement(); // 1400 × 800 px in 700 × 400 mm: exactly fills
    expect(textureAt(configuration, 'LEFT', 0, 0)[0]).toBeCloseTo(0);
    expect(textureAt(configuration, 'RIGHT', 0, 200)[0]).toBeCloseTo(0.5);
  });

  it('reads older data without the layout fields as per-wall artwork', () => {
    const configuration: Partial<BagConfiguration> = createConfiguration('BLOCK');
    delete configuration.artworkLayout;
    delete configuration.wrapArtwork;
    const legacy = configuration as BagConfiguration;
    expect(getArtworkLayout(legacy)).toBe('PER_PANEL');
    expect(getWrapArtwork(legacy).artwork).toBeNull();
    expect(resolvePanelArtwork(legacy, 'FRONT').source).toBe('FRONT');
  });

  it('counts only the artwork of the active layout', () => {
    const configuration = wrapConfiguration();
    expect(hasActiveArtwork(configuration)).toBe(true);
    configuration.artworkLayout = 'PER_PANEL';
    expect(hasActiveArtwork(configuration)).toBe(false);
    configuration.panels.LEFT.artwork = artwork('left');
    expect(hasActiveArtwork(configuration)).toBe(true);
  });
});
