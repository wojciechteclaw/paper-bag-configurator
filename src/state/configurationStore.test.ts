import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLACEMENT } from '../domain/artworkPlacement';
import { ARTWORK_EXTEND_TO_BOTTOM_DEFAULT } from '../domain/config/productionRules';
import { createArtwork, createConfiguration } from '../domain/factories';
import { validateDimensions } from '../domain/validation/dimensions';
import { BAG_TYPES, COLOR_ANALYSIS_DEFAULTS, COLOR_ANALYSIS_LIMITS } from '../domain/config/productCatalog';
import type { PrintSpec } from '../domain/types';
import { useConfigurationStore } from './configurationStore';
import { CONFIGURATOR_STEPS, useConfiguratorUiStore } from './configuratorUiStore';
import { usePreviewStore } from './previewStore';

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
    expect(config().dimensions.height).toBe(470);
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

  it('ignores unknown ids and applies the large catalogue sizes (limits cover the client size table)', () => {
    expect(store().applyStandardSize('nope')).toBe(false);
    expect(config().dimensions).toEqual(BAG_TYPES.BLOCK.defaultDimensions);
    expect(store().applyStandardSize('320x220x400')).toBe(true);
    expect(config().dimensions).toEqual({ width: 320, depth: 220, height: 400 });
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
    expect(config().handle).toMatchObject({ type: 'TWISTED_PAPER', material: 'KRAFT', patch: { width: 110, height: 20 } });
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

it('gives new artwork the default placement (ARTWORK_EXTEND_TO_BOTTOM_DEFAULT)', () => {    store().setPanelArtwork('RIGHT', artwork('blob:r'));    expect(config().panels.RIGHT.placement).toEqual(DEFAULT_PLACEMENT);    expect(DEFAULT_PLACEMENT).toEqual({ mode: 'FILL', extendToBottom: ARTWORK_EXTEND_TO_BOTTOM_DEFAULT });  });
  it('resets the placement to FILL when the artwork is replaced or removed', () => {
    store().setPanelArtwork('FRONT', artwork('blob:a'));
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 5, offsetY: 5, scale: 2, rotation: 0, extendToBottom: false });
    store().setPanelArtwork('FRONT', artwork('blob:b'));
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: false });
  });
});

describe('panel placement', () => {
  it('sets a normalized placement on one panel only', () => {
    store().setPanelPlacement('LEFT', { mode: 'CUSTOM', offsetX: 999, offsetY: -10, scale: 50, rotation: 90, extendToBottom: false });
    // LEFT is 150 × 400 mm: the centre stays on the wall, scale ≤ 10.
    expect(config().panels.LEFT.placement).toEqual({ mode: 'CUSTOM', offsetX: 75, offsetY: -10, scale: 10, rotation: 90, extendToBottom: false });
    expect(config().panels.FRONT.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('resets the placement to FILL', () => {
    store().setPanelPlacement('BACK', { mode: 'CUSTOM', offsetX: 1, offsetY: 2, scale: 1.5, rotation: 180, extendToBottom: true });
    store().resetPanelPlacement('BACK');
    expect(config().panels.BACK.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('normalises against the extended area when the placement extends to the bottom', () => {
    // FRONT 200 × 400, a = 90 → area 200 × 490: the centre may go down to 245 mm below the area centre.
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 0, offsetY: -999, scale: 1, rotation: 0, extendToBottom: true });
    expect(config().panels.FRONT.placement).toMatchObject({ offsetY: -245, extendToBottom: true });
  });

  it('toggles "extend to bottom", keeping a CUSTOM image in place and FILL stretched', () => {
    store().setPanelArtwork('FRONT', artwork('blob:a'));
    store().setPanelExtendToBottom('FRONT', true);
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 0, extendToBottom: false });
    store().setPanelExtendToBottom('FRONT', true);
    // 100 × 200 px image, contain on 200 × 400 = 200 × 400 mm centred at y = 200; on the 200 × 490 area centred at
    // y = 155 the same rect is offsetY +45 (contain is width-limited on both areas, so the scale stays 1).
    const placement = config().panels.FRONT.placement;
    expect(placement).toMatchObject({ mode: 'CUSTOM', offsetX: 0, extendToBottom: true });
    expect(placement.mode === 'CUSTOM' && placement.offsetY).toBeCloseTo(45);
    expect(placement.mode === 'CUSTOM' && placement.scale).toBeCloseTo(1);
    // Replacing the image keeps the choice, removing it clears it; reset clears it too, fill keeps it.
    store().setPanelArtwork('FRONT', artwork('blob:b'));
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    store().fillPanelPlacement('FRONT');
    expect(config().panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    store().resetPanelPlacement('FRONT');
    expect(config().panels.FRONT.placement).toEqual(DEFAULT_PLACEMENT);
    store().setPanelExtendToBottom('FRONT', true);
    store().setPanelArtwork('FRONT', null);
    expect(config().panels.FRONT.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('aligns the artwork in its (extended) area; ignored without artwork', () => {
    store().alignPanelArtwork('BACK', { horizontal: 'LEFT' });
    expect(config().panels.BACK.placement).toEqual(DEFAULT_PLACEMENT);
    store().setPanelArtwork('BACK', createArtwork({ fileName: 's.png', fileUrl: 'blob:s', mimeType: 'image/png', width: 100, height: 100, sizeBytes: 1 }));
    store().alignPanelArtwork('BACK', { horizontal: 'CENTER', vertical: 'TOP' });
    // Square contain on 200 × 400: 200 × 200, top-aligned → +100.
    expect(config().panels.BACK.placement).toEqual({ mode: 'CUSTOM', offsetX: 0, offsetY: 100, scale: 1, rotation: 0, extendToBottom: false });
    store().setPanelExtendToBottom('BACK', true);
    store().alignPanelArtwork('BACK', { vertical: 'BOTTOM' });
    // Area 200 × 490 (scale re-expressed 200 / 200 → the image stays 200 mm): bottom → −(490 − 200) / 2.
    expect(config().panels.BACK.placement).toMatchObject({ offsetY: -145, extendToBottom: true });
  });

  it('keeps the configuration JSON-serialisable', () => {
    store().setPanelPlacement('FRONT', { mode: 'CUSTOM', offsetX: 1, offsetY: 2, scale: 1.5, rotation: 270, extendToBottom: true });
    expect(JSON.parse(JSON.stringify(config()))).toEqual(config());
  });
});

describe('print and packaging', () => {
  it('adds normalised Pantone colours and reports errors', () => {
    expect(store().addPantoneColor('  PMS 186 C ')).toBeNull();
    expect(store().addPantoneColor('pms 186 c')).toBe('DUPLICATE');
    expect(store().addPantoneColor('')).toBe('EMPTY');
    expect(config().print.pantoneColors).toEqual([{ code: 'PMS 186 C', hex: '#c8102e' }]);
  });

  it('stores the given preview colour, rejects an invalid one and suggests distinct colours otherwise', () => {
    expect(store().addPantoneColor('PMS 7621 C', '#ABC')).toBeNull();
    expect(store().addPantoneColor('PMS 1 C', 'blue')).toBe('INVALID_HEX');
    expect(store().addPantoneColor('PMS 2 C')).toBeNull();
    expect(store().addPantoneColor('PMS 3 C')).toBeNull();
    const [first, second, third] = config().print.pantoneColors;
    expect(first).toEqual({ code: 'PMS 7621 C', hex: '#aabbcc' });
    expect(second.hex).not.toBe(third.hex);
  });

  it('changes a preview colour and ignores invalid values', () => {
    store().addPantoneColor('PMS 186 C');
    store().setPantoneColorHex(0, '#00FF00');
    expect(config().print.pantoneColors[0].hex).toBe('#00ff00');
    store().setPantoneColorHex(0, 'nope');
    store().setPantoneColorHex(5, '#ffffff');
    expect(config().print.pantoneColors).toEqual([{ code: 'PMS 186 C', hex: '#00ff00' }]);
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
    expect(config().print.pantoneColors.map((color) => color.code)).toEqual(['B']);
  });

  it('sets packaging', () => {
    store().setPackaging('FOIL');
    expect(config().packaging).toBe('FOIL');
  });

  it('starts with the catalog colour-analysis defaults and sets / clamps them', () => {
    expect(config().print.colorAnalysis).toEqual(COLOR_ANALYSIS_DEFAULTS);
    store().setColorAnalysis({ mergeTolerance: 4 });
    expect(config().print.colorAnalysis).toEqual({ mergeTolerance: 4, minAreaShare: COLOR_ANALYSIS_DEFAULTS.minAreaShare });
    store().setColorAnalysis({ minAreaShare: 0.01 });
    expect(config().print.colorAnalysis).toEqual({ mergeTolerance: 4, minAreaShare: 0.01 });
    store().setColorAnalysis({ mergeTolerance: 99, minAreaShare: -1 });
    expect(config().print.colorAnalysis).toEqual({ mergeTolerance: COLOR_ANALYSIS_LIMITS.mergeTolerance.max, minAreaShare: 0 });
    store().setColorAnalysis({ mergeTolerance: Number.NaN });
    expect(config().print.colorAnalysis.mergeTolerance).toBe(COLOR_ANALYSIS_DEFAULTS.mergeTolerance);
  });

  it('migrates configurations saved without colour-analysis settings', () => {
    const { colorAnalysis: _omitted, ...legacyPrint } = config().print;
    useConfigurationStore.setState({ configuration: { ...config(), print: legacyPrint as PrintSpec } });
    store().setColorAnalysis({ minAreaShare: 0.02 });
    expect(config().print.colorAnalysis).toEqual({ mergeTolerance: COLOR_ANALYSIS_DEFAULTS.mergeTolerance, minAreaShare: 0.02 });
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

describe('fold preview state (docs/SPEC.md §4a/§4c)', () => {
  it('the preview timeline never appears on the configuration or its JSON serialisation', () => {
    usePreviewStore.getState().setProgress(0.42);
    expect(config()).not.toHaveProperty('foldProgress');
    expect(config()).not.toHaveProperty('progress');
    const json = JSON.stringify(config());
    expect(json).not.toMatch(/foldProgress|"progress"/);
  });
});

describe('whole-bag (wrap) artwork', () => {
  beforeEach(() => {
    URL.revokeObjectURL = vi.fn();
  });

  it('starts per wall and switches layouts without dropping the other layout\'s artwork', () => {
    expect(config().artworkLayout).toBe('PER_PANEL');
    store().setPanelArtwork('FRONT', artwork('blob:front'));
    store().setArtworkLayout('WRAP');
    expect(config().artworkLayout).toBe('WRAP');
    store().setPanelArtwork('WRAP', artwork('blob:wrap'));
    store().setArtworkLayout('PER_PANEL');
    expect(config().panels.FRONT.artwork?.fileUrl).toBe('blob:front');
    expect(config().wrapArtwork.artwork?.fileUrl).toBe('blob:wrap');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    store().setArtworkLayout('SIDEWAYS' as never);
    expect(config().artworkLayout).toBe('PER_PANEL');
  });

  it('stores the wrap artwork in its own slot and revokes its URL on replace / remove', () => {
    store().setPanelArtwork('WRAP', artwork('blob:one'));
    expect(config().wrapArtwork).toEqual({ artwork: expect.objectContaining({ fileUrl: 'blob:one' }), placement: DEFAULT_PLACEMENT });
    expect(config().panels.FRONT.artwork).toBeNull();
    store().setPanelArtwork('WRAP', artwork('blob:two'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one');
    store().setPanelArtwork('WRAP', null);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two');
    expect(config().wrapArtwork.artwork).toBeNull();
  });

  it('normalises wrap placements against the whole wall row (2W + 2D wide), not a single wall', () => {
    store().setPanelArtwork('WRAP', artwork('blob:wrap'));
    // 200 × 400 × 150: wall row 700 mm → the centre may move up to ±350 mm.
    store().setPanelPlacement('WRAP', { mode: 'CUSTOM', offsetX: 300, offsetY: 0, scale: 1, rotation: 0, extendToBottom: false });
    expect(config().wrapArtwork.placement).toMatchObject({ offsetX: 300 });
    store().setPanelPlacement('WRAP', { mode: 'CUSTOM', offsetX: 999, offsetY: 0, scale: 1, rotation: 0, extendToBottom: false });
    expect(config().wrapArtwork.placement).toMatchObject({ offsetX: 350 });
    expect(config().panels.LEFT.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('aligns, fills, extends to the bottom and resets the wrap placement', () => {
    store().setPanelArtwork('WRAP', artwork('blob:wrap')); // 100 × 200 px → contain in 700 × 400: 200 × 400 mm
    store().alignPanelArtwork('WRAP', { horizontal: 'LEFT' });
    expect(config().wrapArtwork.placement).toMatchObject({ mode: 'CUSTOM', offsetX: -250, offsetY: 0 });
    store().setPanelExtendToBottom('WRAP', true);
    expect(config().wrapArtwork.placement.extendToBottom).toBe(true);
    store().fillPanelPlacement('WRAP');
    expect(config().wrapArtwork.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    store().resetPanelPlacement('WRAP');
    expect(config().wrapArtwork.placement).toEqual(DEFAULT_PLACEMENT);
  });
});
