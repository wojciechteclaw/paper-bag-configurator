import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../src/domain/factories';
import { getWindowDimensions, getWindowOpening, validateWindow } from '../../src/domain/window';
import { useConfigurationStore } from '../../src/state/configurationStore';

const store = () => useConfigurationStore.getState();
const config = () => store().configuration;

beforeEach(() => {
  useConfigurationStore.setState({ configuration: createConfiguration('FOLDED') });
});

describe('window actions (docs/SPEC.md §2b)', () => {
  it('adds, switches and removes the window', () => {
    store().setWindowType('PANORAMIC');
    expect(config().window).toEqual({ type: 'PANORAMIC', material: 'PP', width: 40, bottomOffset: 40, filmOverlap: 10 });
    store().setWindowMaterial('CELLULOSE');
    store().setWindowType('RECTANGLE');
    expect(config().window).toMatchObject({ type: 'RECTANGLE', material: 'CELLULOSE', width: 40, height: 110, bottomOffset: 145 });
    store().setWindowType(null);
    expect(config().window).toBeNull();
  });

  it('is not available on the block-bottom bag', () => {
    useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
    store().setWindowType('RECTANGLE');
    expect(config().window).toBeNull();
  });

  it('constrains values into the limits; a larger overlap narrows the opening', () => {
    store().setWindowType('RECTANGLE');
    store().setWindowValue('width', 500);
    expect(config().window?.width).toBe(110);
    store().setWindowValue('filmOverlap', 20);
    expect(config().window).toMatchObject({ filmOverlap: 20, width: 90 });
    store().setWindowValue('bottomOffset', Number.NaN);
    expect(config().window?.type === 'RECTANGLE' && config().window).toMatchObject({ bottomOffset: 145 });
    store().setWindowMaterial('GLASS' as never);
    expect(config().window?.material).toBe('PP');
  });

  it('ignores the rectangle-only fields on a panoramic window', () => {
    store().setWindowType('PANORAMIC');
    const before = config().window;
    store().setWindowValue('height', 100);
    expect(config().window).toBe(before);
  });

  it('keeps the window valid when the bag gets smaller', () => {
    store().setWindowType('RECTANGLE');
    store().setWindowValue('width', 110);
    store().setDimension('width', 100);
    store().setDimension('height', 170);
    const { window, dimensions } = config();
    expect(window && validateWindow(window, dimensions)).toEqual([]);
    expect(window?.width).toBe(70);
  });

  it('follows the configured bottom strip d (the opening keeps overlap + 5 mm above it)', () => {
    store().setWindowType('RECTANGLE');
    store().setWindowValue('bottomOffset', 40); // d 25 + 15
    store().setBottomFoldDepth(30);
    expect(config().window).toMatchObject({ bottomOffset: 45 });
    store().setWindowType('PANORAMIC');
    expect(getWindowOpening(config().window!, getWindowDimensions(config())).y).toBe(45);
  });

  it('drops the window when the type changes to the block bottom', () => {
    store().setWindowType('PANORAMIC');
    const adjustments = store().setProductType('BLOCK');
    expect(config().window).toBeNull();
    expect(adjustments).toContainEqual({ field: 'window', removed: true });
  });
});
