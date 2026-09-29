import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtwork, createConfiguration } from '../domain/factories';
import { validateDimensions } from '../domain/validation/dimensions';
import { BAG_TYPES } from '../domain/config/productCatalog';
import { useConfigurationStore } from './configurationStore';
import { CONFIGURATOR_STEPS, useConfiguratorUiStore } from './configuratorUiStore';

const store = () => useConfigurationStore.getState();
const config = () => store().configuration;

const artwork = (fileUrl: string) =>
  createArtwork({ fileName: 'a.png', fileUrl, mimeType: 'image/png', width: 100, height: 200, sizeBytes: 10 });

beforeEach(() => {
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
});

describe('setDimension', () => {
  it('stores a valid value unchanged', () => {
    store().setDimension('width', 250);
    expect(config().dimensions.width).toBe(250);
  });

  it('never lets width drop below depth', () => {
    store().setDimension('width', 100);
    expect(config().dimensions).toEqual({ width: 150, height: 400, depth: 150 });
  });

  it('never lets depth exceed width', () => {
    store().setDimension('depth', 260);
    expect(config().dimensions.depth).toBe(200);
  });

  it('snaps off-step values and clamps out-of-range values', () => {
    store().setDimension('height', 333);
    expect(config().dimensions.height).toBe(335);
    store().setDimension('height', 9999);
    expect(config().dimensions.height).toBe(430);
  });

  it('ignores NaN', () => {
    store().setDimension('width', Number.NaN);
    expect(config().dimensions.width).toBe(200);
  });

  it('always leaves the dimensions valid', () => {
    const requests: [keyof ReturnType<typeof config>['dimensions'], number][] = [
      ['depth', 300],
      ['width', 80],
      ['depth', 5],
      ['width', 3],
      ['height', -20],
      ['depth', 1234],
    ];
    for (const [key, value] of requests) {
      store().setDimension(key, value);
      expect(validateDimensions(config().dimensions, BAG_TYPES.BLOCK.limits)).toEqual({});
    }
  });
});

describe('applyStandardSize', () => {
  it('applies a standard size of the current handle variant regardless of update order', () => {
    // Default 200 × 150 depth: a naive width-first update to 80 would be clamped by the depth lock.
    expect(store().applyStandardSize('80x45x220')).toBe(true);
    expect(config().dimensions).toEqual({ width: 80, depth: 45, height: 220 });
    expect(validateDimensions(config().dimensions, BAG_TYPES.BLOCK.limits)).toEqual({});
  });

  it('ignores sizes outside the dimension limits and unknown ids', () => {
    expect(store().applyStandardSize('320x220x400')).toBe(false);
    expect(store().applyStandardSize('nope')).toBe(false);
    expect(config().dimensions).toEqual(BAG_TYPES.BLOCK.defaultDimensions);
  });

  it('only offers sizes of the current handle variant', () => {
    expect(store().applyStandardSize('180x85x230')).toBe(false);
    store().setHandle('FLAT_PAPER');
    expect(store().applyStandardSize('180x85x230')).toBe(true);
    expect(config().dimensions).toEqual({ width: 180, depth: 85, height: 230 });
  });
});

describe('paper', () => {
  it('defaults to brown kraft without extras', () => {
    expect(config().paper).toEqual({
      type: 'KRAFT',
      color: 'BROWN',
      grammage: 80,
      fscCertified: false,
      moistureBarrier: false,
    });
  });

  it('sets type, colour, grammage, FSC and moisture barrier', () => {
    store().setPaperType('GREASEPROOF');
    store().setPaperColor('WHITE');
    store().setGrammage(60);
    store().setFscCertified(true);
    store().setMoistureBarrier(true);
    expect(config().paper).toEqual({
      type: 'GREASEPROOF',
      color: 'WHITE',
      grammage: 60,
      fscCertified: true,
      moistureBarrier: true,
    });
  });

  it('constrains grammage to the current handle variant range and step', () => {
    store().setGrammage(200);
    expect(config().paper.grammage).toBe(120);
    store().setGrammage(10);
    expect(config().paper.grammage).toBe(50);
    store().setGrammage(63);
    expect(config().paper.grammage).toBe(60);
    store().setHandle('FLAT_PAPER');
    store().setGrammage(200);
    expect(config().paper.grammage).toBe(110);
  });

  it('ignores paper types and moisture barrier not offered for the handle variant', () => {
    store().setHandle('TWISTED_PAPER');
    store().setPaperType('COATED');
    store().setMoistureBarrier(true);
    expect(config().paper.type).toBe('KRAFT');
    expect(config().paper.moistureBarrier).toBe(false);
    store().setPaperType('RECYCLED');
    expect(config().paper.type).toBe('RECYCLED');
  });
});

describe('setHandle', () => {
  it('constrains the paper into the new variant and reports the adjustments', () => {
    store().setPaperType('COATED');
    store().setGrammage(50);
    store().setMoistureBarrier(true);
    store().setFscCertified(true);
    const adjustments = store().setHandle('FLAT_PAPER');
    expect(adjustments).toEqual([
      { field: 'type', from: 'COATED', to: 'KRAFT' },
      { field: 'grammage', from: 50, to: 70 },
      { field: 'moistureBarrier', from: true, to: false },
    ]);
    expect(config().paper).toEqual({
      type: 'KRAFT',
      color: 'BROWN',
      grammage: 70,
      fscCertified: true,
      moistureBarrier: false,
    });
  });

  it('reports nothing when the paper already fits', () => {
    expect(store().setHandle('TWISTED_PAPER')).toEqual([]);
    expect(store().setHandle(null)).toEqual([]);
  });

  it('creates a kraft handle with a patch from the catalog defaults', () => {
    store().setHandle('TWISTED_PAPER');
    expect(config().handle).toMatchObject({ type: 'TWISTED_PAPER', material: 'KRAFT', patch: { width: 80, height: 50 } });
  });

  it('adds, keeps and removes a handle', () => {
    store().setHandle('FLAT_PAPER');
    const handle = config().handle;
    expect(handle?.type).toBe('FLAT_PAPER');
    store().setHandle('FLAT_PAPER');
    expect(config().handle).toBe(handle);
    store().setHandle('TWISTED_PAPER');
    expect(config().handle?.type).toBe('TWISTED_PAPER');
    store().setHandle(null);
    expect(config().handle).toBeNull();
  });
});

describe('setPanelArtwork', () => {
  const revoke = vi.fn();
  const original = URL.revokeObjectURL;
  beforeEach(() => {
    revoke.mockClear();
    URL.revokeObjectURL = revoke;
  });
  afterEach(() => {
    URL.revokeObjectURL = original;
  });

  it('sets artwork on the right panel only', () => {
    const a = artwork('blob:a');
    store().setPanelArtwork('LEFT', a);
    expect(config().panels.LEFT.artwork).toBe(a);
    expect(config().panels.FRONT.artwork).toBeNull();
  });

  it('revokes the previous object URL on replace and on remove', () => {
    store().setPanelArtwork('FRONT', artwork('blob:a'));
    store().setPanelArtwork('FRONT', artwork('blob:b'));
    expect(revoke).toHaveBeenCalledWith('blob:a');
    store().setPanelArtwork('FRONT', null);
    expect(revoke).toHaveBeenCalledWith('blob:b');
    expect(config().panels.FRONT.artwork).toBeNull();
  });

  it('resets the placement to FILL when the artwork is replaced or removed', () => {
    store().setPanelArtwork('FRONT', artwork('blob:a'));
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 5, offsetY: 5, scale: 2, rotation: 0 });
    store().setPanelArtwork('FRONT', artwork('blob:b'));
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL' });
  });
});

describe('panel placement', () => {
  it('sets a normalized placement on one panel only', () => {
    store().setPanelPlacement('LEFT', { mode: 'CUSTOM', offsetX: 999, offsetY: -10, scale: 50, rotation: 90 });
    // LEFT is 150 × 400 mm: the centre stays on the wall, scale ≤ 10.
    expect(config().panels.LEFT.placement).toEqual({ mode: 'CUSTOM', offsetX: 75, offsetY: -10, scale: 10, rotation: 90 });
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL' });
  });

  it('resets the placement to FILL', () => {
    store().setPanelPlacement('BACK', { mode: 'CUSTOM', offsetX: 1, offsetY: 2, scale: 1.5, rotation: 180 });
    store().resetPanelPlacement('BACK');
    expect(config().panels.BACK.placement).toEqual({ mode: 'FILL' });
  });

  it('keeps the configuration JSON-serialisable', () => {
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 1, offsetY: 2, scale: 1.5, rotation: 270 });
    expect(JSON.parse(JSON.stringify(config()))).toEqual(config());
  });
});

describe('print, packaging and quantity', () => {
  it('adds normalised Pantone colours and reports errors', () => {
    expect(store().addPantoneColor('  PMS 186 C ')).toBeNull();
    expect(store().addPantoneColor('pms 186 c')).toBe('DUPLICATE');
    expect(store().addPantoneColor('')).toBe('EMPTY');
    expect(config().print.pantoneColors).toEqual(['PMS 186 C']);
  });

  it('caps Pantone colours at the catalog maximum', () => {
    for (let i = 0; i < 8; i++) expect(store().addPantoneColor(`PMS ${i} C`)).toBeNull();
    expect(store().addPantoneColor('PMS 999 C')).toBe('LIMIT_REACHED');
    expect(config().print.pantoneColors).toHaveLength(BAG_TYPES.BLOCK.print.maxColors);
  });

  it('removes a Pantone colour by index', () => {
    store().addPantoneColor('A');
    store().addPantoneColor('B');
    store().removePantoneColor(0);
    expect(config().print.pantoneColors).toEqual(['B']);
  });

  it('sets packaging', () => {
    store().setPackaging('FOIL');
    expect(config().packaging).toBe('FOIL');
  });

  it('keeps quantity at or above the minimum run', () => {
    store().setQuantity(50_000);
    expect(config().quantity).toBe(50_000);
    store().setQuantity(10);
    expect(config().quantity).toBe(30_000);
  });
});

describe('setProductType', () => {
  it('ignores unavailable types and re-selecting the current type', () => {
    store().setDimension('width', 250);
    store().setProductType('FOLDED');
    store().setProductType('BLOCK');
    expect(config().productType).toBe('BLOCK');
    expect(config().dimensions.width).toBe(250);
  });
});

describe('configurator UI store', () => {
  beforeEach(() => useConfiguratorUiStore.setState({ step: CONFIGURATOR_STEPS[0] }));

  it('moves between steps within bounds', () => {
    const ui = useConfiguratorUiStore.getState;
    ui().previousStep();
    expect(ui().step).toBe('typeAndDimensions');
    ui().nextStep();
    expect(ui().step).toBe('paperAndHandle');
    ui().setStep('summary');
    ui().nextStep();
    expect(ui().step).toBe('summary');
  });

  it('is not part of the configuration', () => {
    const before = config();
    useConfiguratorUiStore.getState().setStep('artwork');
    expect(config()).toBe(before);
    expect(config()).not.toHaveProperty('step');
  });
});
