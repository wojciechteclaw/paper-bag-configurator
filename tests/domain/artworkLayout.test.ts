import { describe, expect, it } from 'vitest';
import {
  getActiveArtworkTargets,
  getArtworkLayout,
  getArtworkSlot,
  getArtworkTargetArea,
  getArtworkTargetSize,
  getNewWrapLayerPlacement,
  getWrapArtworkArea,
  getWrapLayerId,
  getWrapLayers,
  getWrapPanelOffset,
  hasActiveArtwork,
  isWrapLayerTarget,
  legacyWrapLayerId,
  migrateLegacyWrapArtwork,
  resolvePanelArtwork,
  resolvePanelArtworks,
  SHEET_PANEL_ORDER,
  withWrapLayers,
  WRAP_PANEL_ORDER,
  wrapLayerTarget,
} from '../../src/domain/artworkLayout';
import {
  computePanelUvTransform,
  containPlacement,
  fillPlacement,
  getArtworkRect,
  getPanelArtworkArea,
  movePlacement,
  normalizePlacement,
  wrapIntoPeriod,
} from '../../src/domain/artworkPlacement';
import { MAX_WRAP_ARTWORK_LAYERS } from '../../src/domain/config/productCatalog';
import { buildDieline } from '../../src/domain/dieline';
import { createArtwork, createConfiguration, createWrapLayer } from '../../src/domain/factories';
import { getPanelSize } from '../../src/domain/panels';
import type { BagConfiguration, LegacyWrapArtwork, PanelPosition } from '../../src/domain/types';

const artwork = (name: string, width = 1400, height = 800) =>
  createArtwork({ fileName: name, fileUrl: `blob:${name}`, mimeType: 'image/png', width, height, sizeBytes: 1 });

/** 200 × 400 × 150 (W × H × D): wrap 700 mm, allowance a = 90 mm; one FILL layer. */
function wrapConfiguration(extendToBottom = false): BagConfiguration {
  const configuration = createConfiguration('BLOCK');
  configuration.artworkLayout = 'WRAP';
  configuration.wrapLayers = [createWrapLayer(artwork('wrap'), fillPlacement(extendToBottom))];
  return configuration;
}

/** Texture coordinate of panel-local point (x, y) for layer `index` — the three.js transform with centre (0, 0). */
function textureAt(configuration: BagConfiguration, position: PanelPosition, x: number, y: number, index = 0): [number, number] {
  const layer = resolvePanelArtwork(configuration, position).layers[index];
  const size = getPanelSize(position, configuration.dimensions);
  const { repeat, offset, rotation } = computePanelUvTransform(size, layer.artwork, layer.placement, layer.area);
  const u = x / size.width;
  const v = y / size.height;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [repeat[0] * (c * u + s * v) + offset[0], repeat[1] * (-s * u + c * v) + offset[1]];
}

describe('wrap geometry', () => {
  it('runs around the bag from the left edge of FRONT (client decision): FRONT | RIGHT | BACK | LEFT', () => {
    const { dimensions } = createConfiguration('BLOCK');
    expect(WRAP_PANEL_ORDER).toEqual(['FRONT', 'RIGHT', 'BACK', 'LEFT']);
    expect(WRAP_PANEL_ORDER.map((p) => getWrapPanelOffset(p, dimensions))).toEqual([0, 200, 350, 550]);
  });

  it('keeps the sheet order LEFT | FRONT | RIGHT | BACK for the dieline columns and per-wall listings', () => {
    const { dimensions } = createConfiguration('BLOCK');
    const dieline = buildDieline({ dimensions, handle: null });
    expect(SHEET_PANEL_ORDER).toEqual(dieline.segments.map((segment) => segment.panel));
  });

  it('covers the four walls (glue flap excluded), plus the bottom allowance when extended', () => {
    const dimensions = { width: 200, height: 400, depth: 150 };
    expect(getWrapArtworkArea(dimensions, { extendToBottom: false })).toEqual({ x: 0, y: 0, width: 700, height: 400, periodicX: true });
    expect(getWrapArtworkArea(dimensions, { extendToBottom: true })).toEqual({ x: 0, y: -90, width: 700, height: 490, periodicX: true });
    expect(getArtworkTargetSize(wrapLayerTarget('a'), dimensions)).toEqual({ width: 700, height: 400 });
    expect(getArtworkTargetSize('LEFT', dimensions)).toEqual({ width: 150, height: 400 });
    expect(getArtworkTargetArea('FRONT', dimensions, { extendToBottom: true })).toEqual(
      getPanelArtworkArea('FRONT', dimensions, { extendToBottom: true }),
    );
    expect(getArtworkTargetArea(wrapLayerTarget('a'), dimensions, { extendToBottom: true })).toEqual({
      x: 0,
      y: -90,
      width: 700,
      height: 490,
      periodicX: true,
    });
  });
});

describe('layer targets', () => {
  it('encodes a layer id as WRAP:<id> and tells walls apart', () => {
    expect(wrapLayerTarget('abc')).toBe('WRAP:abc');
    expect(getWrapLayerId('WRAP:abc')).toBe('abc');
    expect(getWrapLayerId('FRONT')).toBeNull();
    expect(isWrapLayerTarget('WRAP:abc')).toBe(true);
    expect(isWrapLayerTarget('LEFT')).toBe(false);
    expect(isWrapLayerTarget(null)).toBe(false);
  });
});

describe('getWrapLayers / migration of the pre-layer wrapArtwork', () => {
  it('migrates a single legacy wrap artwork to a one-element layer list with a stable id', () => {
    const legacyArtwork = artwork('legacy');
    const legacy: LegacyWrapArtwork = { artwork: legacyArtwork, placement: containPlacement(90, true) };
    const configuration = { ...createConfiguration('BLOCK'), artworkLayout: 'WRAP' as const, wrapArtwork: legacy };
    delete (configuration as Partial<BagConfiguration>).wrapLayers;
    const layers = getWrapLayers(configuration);
    expect(layers).toEqual([{ id: legacyWrapLayerId(legacyArtwork), artwork: legacyArtwork, placement: legacy.placement }]);
    // Memoised per slot object: a stable reference (safe in store selectors).
    expect(getWrapLayers(configuration)).toBe(layers);
    // Resolution, targets and slots see the migrated layer.
    const target = wrapLayerTarget(layers[0].id);
    expect(getActiveArtworkTargets(configuration)).toEqual([target]);
    expect(getArtworkSlot(configuration, target).artwork).toBe(legacyArtwork);
    // Rotated contain: a 280 mm wide image centred on the wrap (x 210…490) — on RIGHT and BACK only.
    expect(Object.values(resolvePanelArtworks(configuration)).map((p) => p.layers.length)).toEqual([0, 1, 0, 1]);
  });

  it('migrates an empty legacy slot (and data without any wrap field) to no layers', () => {
    expect(migrateLegacyWrapArtwork({ artwork: null, placement: fillPlacement() })).toEqual([]);
    expect(migrateLegacyWrapArtwork(undefined)).toEqual([]);
    expect(getWrapLayers({})).toEqual([]);
  });

  it('reads a legacy placement without extendToBottom as false', () => {
    const legacy = { artwork: artwork('old'), placement: { mode: 'FILL' } } as unknown as LegacyWrapArtwork;
    expect(migrateLegacyWrapArtwork(legacy)[0].placement).toEqual({ mode: 'FILL', extendToBottom: false });
  });

  it('prefers the layer list over a legacy slot and returns the stored array itself', () => {
    const configuration = wrapConfiguration();
    const withLegacy = { ...configuration, wrapArtwork: { artwork: artwork('ignored'), placement: fillPlacement() } };
    expect(getWrapLayers(withLegacy)).toBe(configuration.wrapLayers);
  });

  it('withWrapLayers converts saved data to the current shape (legacy field dropped, list capped)', () => {
    const legacyArtwork = artwork('legacy');
    const saved: Record<string, unknown> = { ...createConfiguration('BLOCK'), wrapArtwork: { artwork: legacyArtwork, placement: fillPlacement() } };
    delete saved.wrapLayers;
    const current = withWrapLayers(saved as { wrapArtwork: LegacyWrapArtwork });
    expect(current).not.toHaveProperty('wrapArtwork');
    expect(current.wrapLayers.map((layer) => layer.artwork)).toEqual([legacyArtwork]);

    const many = { wrapLayers: Array.from({ length: MAX_WRAP_ARTWORK_LAYERS + 3 }, (_, i) => createWrapLayer(artwork(`l${i}`))) };
    expect(withWrapLayers(many).wrapLayers).toHaveLength(MAX_WRAP_ARTWORK_LAYERS);
  });
});

describe('resolvePanelArtwork', () => {
  it('returns each wall its own artwork (one layer) and area in the per-wall layout (the default)', () => {
    const configuration = createConfiguration('BLOCK');
    configuration.panels.FRONT.artwork = artwork('front');
    configuration.wrapLayers = [createWrapLayer(artwork('kept-wrap'))];
    const resolved = resolvePanelArtworks(configuration);
    expect(resolved.FRONT.layers).toEqual([
      { target: 'FRONT', artwork: configuration.panels.FRONT.artwork, placement: configuration.panels.FRONT.placement, area: { x: 0, y: 0, width: 200, height: 400 }, stackIndex: 0 },
    ]);
    expect(resolved.BACK.layers).toEqual([]);
    expect(resolved.BACK.extendsToBottom).toBe(false);
    expect(getActiveArtworkTargets(configuration)).toEqual(['LEFT', 'FRONT', 'RIGHT', 'BACK']);
  });

  it('gives every wall all layers, bottom → top, over the wrap area shifted into its own coordinates', () => {
    const configuration = wrapConfiguration();
    const logo = createWrapLayer(artwork('logo', 100, 100), containPlacement(0, true));
    configuration.wrapLayers.push(logo);
    configuration.panels.FRONT.artwork = artwork('kept-front'); // inactive: not shown
    const resolved = resolvePanelArtworks(configuration);
    for (const position of WRAP_PANEL_ORDER) {
      expect(resolved[position].layers.map((layer) => layer.target)).toEqual(
        configuration.wrapLayers.map((layer) => wrapLayerTarget(layer.id)),
      );
      expect(resolved[position].layers[1].placement).toBe(logo.placement);
      expect(resolved[position].extendsToBottom).toBe(true);
    }
    expect(resolved.FRONT.layers[0].area).toEqual({ x: 0, y: 0, width: 700, height: 400, periodicX: true });
    expect(resolved.RIGHT.layers[0].area).toEqual({ x: -200, y: 0, width: 700, height: 400, periodicX: true });
    expect(resolved.BACK.layers[0].area).toEqual({ x: -350, y: 0, width: 700, height: 400, periodicX: true });
    expect(resolved.LEFT.layers[0].area).toEqual({ x: -550, y: 0, width: 700, height: 400, periodicX: true });
    // Each layer has its own "extend to bottom".
    expect(resolved.LEFT.layers[1].area).toEqual({ x: -550, y: -90, width: 700, height: 490, periodicX: true });
    expect(getActiveArtworkTargets(configuration)).toEqual(configuration.wrapLayers.map((l) => wrapLayerTarget(l.id)));
  });

  it('maps a FILL layer continuously around the bag: FRONT starts at t = 0, LEFT ends at t = 1', () => {
    const configuration = wrapConfiguration();
    expect(textureAt(configuration, 'FRONT', 0, 0)).toEqual([0, 0]);
    expect(textureAt(configuration, 'LEFT', 150, 400)[0]).toBeCloseTo(1);
    expect(textureAt(configuration, 'LEFT', 150, 400)[1]).toBeCloseTo(1);
    // Right edge of each wall = left edge of the next one around the bag.
    for (let i = 0; i < WRAP_PANEL_ORDER.length - 1; i++) {
      const wall = WRAP_PANEL_ORDER[i];
      const next = WRAP_PANEL_ORDER[i + 1];
      const right = textureAt(configuration, wall, getPanelSize(wall, configuration.dimensions).width, 123);
      const left = textureAt(configuration, next, 0, 123);
      expect(right[0]).toBeCloseTo(left[0]);
      expect(right[1]).toBeCloseTo(left[1]);
    }
    // LEFT starts 550 mm into the 700 mm wrap.
    expect(textureAt(configuration, 'LEFT', 0, 0)[0]).toBeCloseTo(550 / 700);
  });

  it('extends a layer over the bottom allowance of every wall (the image bottom at y = −a)', () => {
    const configuration = wrapConfiguration(true);
    for (const position of WRAP_PANEL_ORDER) {
      expect(resolvePanelArtwork(configuration, position).layers[0].area).toMatchObject({ y: -90, height: 490 });
      expect(textureAt(configuration, position, 0, -90)[1]).toBeCloseTo(0);
    }
  });

  it('keeps a CUSTOM layer placement centred on the whole wrap, not on each wall', () => {
    const configuration = wrapConfiguration();
    configuration.wrapLayers[0].placement = containPlacement(); // 1400 × 800 px in 700 × 400 mm: exactly fills
    expect(textureAt(configuration, 'FRONT', 0, 0)[0]).toBeCloseTo(0);
    // The wrap centre (350 mm) lies 150 mm into BACK.
    expect(textureAt(configuration, 'BACK', 0, 200)[0]).toBeCloseTo(0.5);
  });

  it('reads older data without the layout fields as per-wall artwork', () => {
    const configuration: Partial<BagConfiguration> = createConfiguration('BLOCK');
    delete configuration.artworkLayout;
    delete configuration.wrapLayers;
    const legacy = configuration as BagConfiguration;
    expect(getArtworkLayout(legacy)).toBe('PER_PANEL');
    expect(getWrapLayers(legacy)).toEqual([]);
    expect(resolvePanelArtwork(legacy, 'FRONT').layers).toEqual([]);
  });

  it('counts only the artwork of the active layout', () => {
    const configuration = wrapConfiguration();
    expect(hasActiveArtwork(configuration)).toBe(true);
    configuration.artworkLayout = 'PER_PANEL';
    expect(hasActiveArtwork(configuration)).toBe(false);
    configuration.panels.LEFT.artwork = artwork('left');
    expect(hasActiveArtwork(configuration)).toBe(true);
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = [];
    expect(hasActiveArtwork(configuration)).toBe(false);
  });
});

describe('getNewWrapLayerPlacement', () => {
  const dimensions = { width: 200, height: 400, depth: 150 };

  it('fills the wrap with the first layer', () => {
    expect(getNewWrapLayerPlacement(dimensions, { width: 100, height: 100 }, 0, false)).toEqual(fillPlacement(false));
    expect(getNewWrapLayerPlacement(dimensions, { width: 100, height: 100 }, 0, true)).toEqual(fillPlacement(true));
  });

  it('fits later layers inside the FRONT wall, centred on it', () => {
    for (const extendToBottom of [false, true]) {
      const placement = getNewWrapLayerPlacement(dimensions, { width: 100, height: 100 }, 2, extendToBottom);
      const area = getWrapArtworkArea(dimensions, { extendToBottom });
      const rect = getArtworkRect(area, { width: 100, height: 100 }, placement, area);
      // A square image contained in the 200 × 400 mm FRONT wall: 200 × 200 mm around its centre (100, 200).
      expect(rect.center.x).toBeCloseTo(100);
      expect(rect.center.y).toBeCloseTo(200);
      expect(rect.width).toBeCloseTo(200);
      expect(rect.height).toBeCloseTo(200);
      expect(placement.extendToBottom).toBe(extendToBottom);
    }
  });
});

describe('cyclic wrap (period 2W + 2D = 700 mm)', () => {
  /** A 100 × 100 mm logo (contain 400 mm × 0.25) centred at wrap x = 350 + offsetX, y = 200. */
  function logoAt(offsetX: number): BagConfiguration {
    const configuration = createConfiguration('BLOCK');
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = [
      createWrapLayer(artwork('logo', 100, 100), { mode: 'CUSTOM', offsetX, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false }),
    ];
    return configuration;
  }
  const walls = (configuration: BagConfiguration) =>
    Object.fromEntries(WRAP_PANEL_ORDER.map((p) => [p, resolvePanelArtwork(configuration, p).layers.map((l) => l.clipX)]));

  it('shows an image straddling the LEFT | FRONT corner on both walls, continuous across the corner', () => {
    const configuration = logoAt(-350); // centre at FRONT's left edge (wrap x 0 ≡ 700)
    expect(walls(configuration)).toEqual({
      FRONT: [{ x0: -50, x1: 50 }],
      RIGHT: [],
      BACK: [],
      LEFT: [{ x0: 100, x1: 200 }], // the copy one period further: LEFT's last 50 mm
    });
    const leftEdge = textureAt(configuration, 'LEFT', 150, 123);
    const frontStart = textureAt(configuration, 'FRONT', 0, 123);
    expect(leftEdge[0]).toBeCloseTo(0.5);
    expect(frontStart[0]).toBeCloseTo(0.5);
    expect(leftEdge[1]).toBeCloseTo(frontStart[1]);
  });

  it('continues an image past the end of the wrap (LEFT’s right edge) onto FRONT', () => {
    const configuration = logoAt(349); // centre at wrap x 699
    expect(walls(configuration)).toEqual({ FRONT: [{ x0: -51, x1: 49 }], RIGHT: [], BACK: [], LEFT: [{ x0: 99, x1: 199 }] });
    expect(textureAt(configuration, 'FRONT', 0, 200)[0]).toBeCloseTo(0.51);
  });

  it('limits an image wider than the bag to one period, so its copies never overlap', () => {
    const configuration = logoAt(0);
    configuration.wrapLayers[0].placement = { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 3, rotation: 0, extendToBottom: false }; // 1200 mm
    for (const position of WRAP_PANEL_ORDER) {
      const copies = resolvePanelArtwork(configuration, position).layers.map((l) => l.clipX!);
      for (const copy of copies) expect(copy.x1 - copy.x0).toBeCloseTo(700);
      if (copies.length === 2) expect(copies[1].x0).toBeCloseTo(copies[0].x1);
    }
  });

  it('keeps a FILL layer a single copy per wall (exactly one period)', () => {
    const configuration = wrapConfiguration();
    for (const position of WRAP_PANEL_ORDER) expect(resolvePanelArtwork(configuration, position).layers).toHaveLength(1);
  });

  it('wraps offsetX into one period instead of clamping, so a drag across either end is continuous', () => {
    const area = getWrapArtworkArea({ width: 200, height: 400, depth: 150 }, { extendToBottom: false });
    const start = { mode: 'CUSTOM', offsetX: -340, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false } as const;
    const moved = movePlacement(start, -20, 0, area);
    expect(moved).toMatchObject({ offsetX: 340 }); // −360 ≡ 340: centre from wrap x 10 to 690 ≡ −10
    expect(movePlacement(moved, 20, 0, area)).toMatchObject({ offsetX: -340 });
    expect(normalizePlacement({ ...start, offsetX: 350 }, area)).toMatchObject({ offsetX: -350 });
    expect(wrapIntoPeriod(-1050, 700)).toBe(-350);
  });
});
