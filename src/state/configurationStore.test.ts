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

describe('paper', () => {
  it('sets colour, grammage and FSC', () => {
    store().setPaperColor('WHITE');
    store().setGrammage(60);
    store().setFscCertified(true);
    expect(config().paper).toEqual({ color: 'WHITE', grammage: 60, fscCertified: true });
  });

  it('constrains grammage to the catalog range and step', () => {
    store().setGrammage(200);
    expect(config().paper.grammage).toBe(100);
    store().setGrammage(63);
    expect(config().paper.grammage).toBe(60);
  });
});

describe('setHandle', () => {
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
