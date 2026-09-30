import { describe, expect, it } from 'vitest';
import { ARTWORK_PLACEMENT_RULES } from '../../../src/domain/config/productionRules';
import { BAG_TYPES, MAX_WRAP_ARTWORK_LAYERS } from '../../../src/domain/config/productCatalog';
import { createConfiguration, createWrapLayer } from '../../../src/domain/factories';
import { sanitizeConfiguration, type ConfigurationAdjustment } from '../../../src/domain/project/sanitizeConfiguration';
import { fixtureArtwork, fixtureProject } from './testFixtures';

function sanitize(raw: unknown) {
  const result = sanitizeConfiguration(raw);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const sections = (adjustments: ConfigurationAdjustment[]) => [...new Set(adjustments.map((a) => a.section))].sort();

describe('sanitizeConfiguration', () => {
  it('leaves a valid configuration unchanged', () => {
    const { configuration } = fixtureProject();
    const result = sanitize(structuredClone(configuration));
    expect(result.adjustments).toEqual([]);
    expect(result.configuration).toEqual(configuration);
    expect(sanitize(createConfiguration('BLOCK')).adjustments).toEqual([]);
  });

  it('clamps dimensions into the catalog limits (step, depth ≤ width) and reports them', () => {
    const { limits } = BAG_TYPES.BLOCK;
    const raw = { ...createConfiguration('BLOCK'), dimensions: { width: 10_000, height: 333, depth: 'deep' } };
    const { configuration, adjustments } = sanitize(raw);
    expect(configuration.dimensions).toEqual({ width: limits.width.max, height: 335, depth: 150 });
    expect(adjustments.map((a) => a.field).sort()).toEqual(['depth', 'height', 'width']);
  });

  it('fits the paper to the handle variant and falls back for unknown options', () => {
    const raw = {
      ...createConfiguration('BLOCK'),
      handle: { id: 'h1', type: 'TWISTED_PAPER', material: 'KRAFT', width: 5, length: 180 },
      paper: { type: 'COATED', color: 'PURPLE', grammage: 55, fscCertified: true, moistureBarrier: true },
      packaging: 'CRATE',
    };
    const { configuration, adjustments } = sanitize(raw);
    expect(configuration.handle).toMatchObject({ id: 'h1', type: 'TWISTED_PAPER' });
    expect(configuration.paper).toEqual({
      type: 'KRAFT',
      color: 'BROWN',
      grammage: 70,
      fscCertified: true,
      moistureBarrier: false,
    });
    expect(configuration.packaging).toBe('CARTON');
    expect(sections(adjustments)).toEqual(['packaging', 'paper']);
  });

  it('drops an unknown handle type and repairs invalid handle values', () => {
    expect(sanitize({ ...createConfiguration('BLOCK'), handle: { type: 'ROPE' } }).configuration.handle).toBeNull();
    const { configuration, adjustments } = sanitize({
      ...createConfiguration('BLOCK'),
      handle: { type: 'FLAT_PAPER', width: -1, patch: { width: 'x' } },
    });
    expect(configuration.handle).toMatchObject({ type: 'FLAT_PAPER', width: 20, patch: { width: 110, height: 20 } });
    expect(configuration.handle?.id).toEqual(expect.any(String));
    expect(adjustments.map((a) => a.field).sort()).toEqual(['patch', 'width']);
  });

  it('normalises placements and drops unusable artwork', () => {
    const configuration = createConfiguration('BLOCK');
    const raw = {
      ...configuration,
      panels: {
        ...configuration.panels,
        FRONT: {
          ...configuration.panels.FRONT,
          artwork: fixtureArtwork('a.png', 'image/png'),
          placement: { mode: 'CUSTOM', offsetX: 9999, offsetY: 0, scale: 1000, rotation: 30, extendToBottom: false },
        },
        BACK: { ...configuration.panels.BACK, artwork: { ...fixtureArtwork('b.gif', 'image/gif') } },
        LEFT: { ...configuration.panels.LEFT, placement: { mode: 'SPIRAL' } },
      },
    };
    const { configuration: sanitized, adjustments } = sanitize(raw);
    expect(sanitized.panels.FRONT.placement).toEqual({
      mode: 'CUSTOM',
      offsetX: 100,
      offsetY: 0,
      scale: ARTWORK_PLACEMENT_RULES.maxScale,
      rotation: 0,
      extendToBottom: false,
    });
    expect(sanitized.panels.BACK.artwork).toBeNull();
    expect(sanitized.panels.LEFT.placement).toEqual({ mode: 'FILL', extendToBottom: false });
    expect(sanitized.panels.RIGHT).toEqual(configuration.panels.RIGHT);
    expect(adjustments.map((a) => a.field).sort()).toEqual([
      'panels.BACK.artwork',
      'panels.FRONT.placement',
      'panels.LEFT.placement',
    ]);
  });

  it('creates missing panels and caps / repairs wrap layers', () => {
    const configuration = createConfiguration('BLOCK');
    const layers = Array.from({ length: MAX_WRAP_ARTWORK_LAYERS + 2 }, (_, i) => createWrapLayer(fixtureArtwork(`${i}.png`, 'image/png')));
    layers[1] = { ...layers[1], id: layers[0].id };
    const raw = { ...configuration, panels: { FRONT: configuration.panels.FRONT }, artworkLayout: 'WRAP', wrapLayers: layers };
    const { configuration: sanitized, adjustments } = sanitize(raw);
    expect(Object.keys(sanitized.panels).sort()).toEqual(['BACK', 'FRONT', 'LEFT', 'RIGHT']);
    expect(sanitized.panels.FRONT).toEqual(configuration.panels.FRONT);
    expect(sanitized.wrapLayers).toHaveLength(MAX_WRAP_ARTWORK_LAYERS);
    expect(new Set(sanitized.wrapLayers.map((layer) => layer.id)).size).toBe(MAX_WRAP_ARTWORK_LAYERS);
    expect(adjustments.map((a) => a.field)).toEqual(['wrapLayers.1.id', 'wrapLayers']);
  });

  it('keeps valid print colours, drops duplicates / invalid codes and repairs preview colours', () => {
    const raw = {
      ...createConfiguration('BLOCK'),
      print: {
        technology: 'OFFSET',
        pantoneColors: [
          { code: ' PMS  186 C ', hex: '#C8102E' },
          { code: 'PANTONE 186 C', hex: '#000000' },
          { code: '', hex: '#000000' },
          { code: '300 C', hex: 'blue' },
        ],
        colorAnalysis: { mergeTolerance: 99, minAreaShare: 0.01 },
      },
    };
    const { configuration, adjustments } = sanitize(raw);
    expect(configuration.print).toEqual({
      technology: 'FLEXO',
      pantoneColors: [
        { code: 'PMS 186 C', hex: '#c8102e' },
        { code: '300 C', hex: '#005eb8' },
      ],
      colorAnalysis: { mergeTolerance: 30, minAreaShare: 0.01 },
    });
    expect(sections(adjustments)).toEqual(['print']);
  });

  it('caps print colours at the catalog maximum', () => {
    const max = BAG_TYPES.BLOCK.print.maxColors;
    const pantoneColors = Array.from({ length: max + 3 }, (_, i) => ({ code: `${100 + i} C`, hex: '#123456' }));
    const { configuration } = sanitize({ ...createConfiguration('BLOCK'), print: { technology: 'FLEXO', pantoneColors } });
    expect(configuration.print.pantoneColors).toHaveLength(max);
  });

  it('fails for data that is not a configuration or has an unavailable bag type', () => {
    expect(sanitizeConfiguration(null)).toEqual({ ok: false, error: 'NOT_A_CONFIGURATION' });
    expect(sanitizeConfiguration({ panels: {} })).toEqual({ ok: false, error: 'NOT_A_CONFIGURATION' });
    expect(sanitizeConfiguration({ ...createConfiguration('BLOCK'), productType: 'toString' })).toMatchObject({
      ok: false,
      error: 'UNSUPPORTED_PRODUCT_TYPE',
    });
  });

  it('fills in a missing id', () => {
    const raw: Record<string, unknown> = { ...createConfiguration('BLOCK') };
    delete raw.id;
    expect(sanitize(raw).configuration.id).toEqual(expect.any(String));
  });
});

describe('sanitizeConfiguration: glue flap width', () => {
  it('keeps a valid width, clamps an out-of-range one and fills in the default for older data', () => {
    const base = createConfiguration('BLOCK');
    const ok = sanitizeConfiguration({ ...base, glueFlapWidth: 14 });
    expect(ok.ok && ok.configuration.glueFlapWidth).toBe(14);
    const clamped = sanitizeConfiguration({ ...base, glueFlapWidth: 40 });
    expect(clamped.ok && clamped.configuration.glueFlapWidth).toBe(20);
    expect(clamped.ok && clamped.adjustments).toContainEqual({ section: 'dimensions', field: 'glueFlapWidth' });
    const { glueFlapWidth: _omit, ...legacy } = base;
    const old = sanitizeConfiguration(legacy);
    expect(old.ok && old.configuration.glueFlapWidth).toBe(10);
  });
});
