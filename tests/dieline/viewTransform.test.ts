import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, panView, pinchStep, zoomView } from '../../src/dieline/viewTransform';

const SHEET_CENTER: [number, number] = [100, 50];

describe('zoomView', () => {
  it('zooms around the view centre by default', () => {
    expect(zoomView({ zoom: 1, center: null }, 2, SHEET_CENTER)).toEqual({ zoom: 2, center: [100, 50] });
  });

  it('keeps the point under the fingers / cursor fixed', () => {
    const view = zoomView({ zoom: 1, center: null }, 2, SHEET_CENTER, [140, 50]);
    // The centre moves halfway towards the anchor: 140 stays at the same screen position.
    expect(view).toEqual({ zoom: 2, center: [120, 50] });
  });

  it('clamps the zoom and returns the same state when nothing changes', () => {
    expect(zoomView({ zoom: 1, center: null }, 1000, SHEET_CENTER).zoom).toBe(MAX_ZOOM);
    expect(zoomView({ zoom: 1, center: null }, 0.001, SHEET_CENTER).zoom).toBe(MIN_ZOOM);
    const atMax = { zoom: MAX_ZOOM, center: [1, 2] as [number, number] };
    expect(zoomView(atMax, 2, SHEET_CENTER)).toBe(atMax);
  });
});

describe('panView', () => {
  it('moves the centre, starting from the sheet centre when unset', () => {
    expect(panView({ zoom: 3, center: null }, [10, -5], SHEET_CENTER)).toEqual({ zoom: 3, center: [110, 45] });
    expect(panView({ zoom: 3, center: [0, 0] }, [1, 1], SHEET_CENTER)).toEqual({ zoom: 3, center: [1, 1] });
  });
});

describe('pinchStep', () => {
  it('spreading the fingers zooms in around their midpoint', () => {
    const step = pinchStep(
      [
        [80, 100],
        [120, 100],
      ],
      [
        [60, 100],
        [140, 100],
      ],
    );
    expect(step).toEqual({ factor: 2, midpoint: [100, 100], pan: [0, 0] });
  });

  it('moving both fingers together pans without zooming', () => {
    const step = pinchStep(
      [
        [0, 0],
        [10, 0],
      ],
      [
        [5, 20],
        [15, 20],
      ],
    );
    expect(step).toEqual({ factor: 1, midpoint: [10, 20], pan: [5, 20] });
  });

  it('ignores degenerate (coincident) finger positions', () => {
    expect(
      pinchStep(
        [
          [5, 5],
          [5, 5],
        ],
        [
          [0, 0],
          [10, 0],
        ],
      ).factor,
    ).toBe(1);
  });
});
