import { describe, expect, it } from 'vitest';
import { getAspectRatio, getPanelSize, hasAspectRatioMismatch } from '../../src/domain/panels';

const dims = { width: 200, height: 400, depth: 150 };

describe('getPanelSize', () => {
  it('uses width × height for FRONT and BACK', () => {
    expect(getPanelSize('FRONT', dims)).toEqual({ width: 200, height: 400 });
    expect(getPanelSize('BACK', dims)).toEqual({ width: 200, height: 400 });
  });

  it('uses depth × height for LEFT and RIGHT', () => {
    expect(getPanelSize('LEFT', dims)).toEqual({ width: 150, height: 400 });
    expect(getPanelSize('RIGHT', dims)).toEqual({ width: 150, height: 400 });
  });
});

describe('getAspectRatio', () => {
  it('returns width / height', () => {
    expect(getAspectRatio({ width: 200, height: 400 })).toBe(0.5);
  });

  it('returns NaN for degenerate sizes', () => {
    expect(getAspectRatio({ width: 0, height: 400 })).toBeNaN();
  });
});

describe('hasAspectRatioMismatch', () => {
  const panel = { width: 200, height: 400 };

  it('accepts an image with the same proportions at any resolution', () => {
    expect(hasAspectRatioMismatch({ width: 1000, height: 2000 }, panel)).toBe(false);
  });

  it('accepts a difference within the tolerance', () => {
    expect(hasAspectRatioMismatch({ width: 1040, height: 2000 }, panel, 0.05)).toBe(false);
  });

  it('warns about a difference beyond the tolerance', () => {
    expect(hasAspectRatioMismatch({ width: 1200, height: 2000 }, panel, 0.05)).toBe(true);
    expect(hasAspectRatioMismatch({ width: 2000, height: 1000 }, panel)).toBe(true);
  });

  it('does not warn for degenerate sizes', () => {
    expect(hasAspectRatioMismatch({ width: 0, height: 0 }, panel)).toBe(false);
  });
});
