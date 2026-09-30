import { describe, expect, it } from 'vitest';
import { BAG_TYPES } from '../../src/domain/config/productCatalog';
import { buildDieline } from '../../src/domain/dieline';
import { createArtwork, createConfiguration, createHandle } from '../../src/domain/factories';
import { getSupportedHandleTypes } from '../../src/domain/handleVariants';
import { changeProductType, getDimensionWarningsFor } from '../../src/domain/productType';
import type { BagConfiguration } from '../../src/domain/types';
import { validateDimensions } from '../../src/domain/validation/dimensions';

const artwork = createArtwork({ fileName: 'a.png', fileUrl: 'blob:a', mimeType: 'image/png', width: 100, height: 200, sizeBytes: 10 });

function blockWithEverything(): BagConfiguration {
  const base = createConfiguration('BLOCK');
  return {
    ...base,
    dimensions: { width: 320, height: 450, depth: 150 },
    handle: createHandle('TWISTED_PAPER'),
    paper: { ...base.paper, type: 'KRAFT', color: 'WHITE', grammage: 100, fscCertified: true },
    panels: {
      ...base.panels,
      FRONT: { ...base.panels.FRONT, artwork, placement: { mode: 'FILL', extendToBottom: true } },
      LEFT: {
        ...base.panels.LEFT,
        artwork,
        placement: { mode: 'CUSTOM', offsetX: 0, offsetY: -20, scale: 0.5, rotation: 0, extendToBottom: true },
      },
    },
    wrapLayers: [
      { id: 'base', artwork, placement: { mode: 'FILL', extendToBottom: true } },
      { id: 'logo', artwork, placement: { mode: 'CUSTOM', offsetX: 30, offsetY: 50, scale: 0.2, rotation: 0, extendToBottom: false } },
    ],
    print: { ...base.print, pantoneColors: [{ code: 'PMS 186 C', hex: '#c8102e' }] },
  };
}

describe('FOLDED catalog entry', () => {
  const folded = BAG_TYPES.FOLDED;

  it('is available with the client ranges [K] and the client example 140 + 90 × 370 as default', () => {
    expect(folded.available).toBe(true);
    expect(folded.limits).toEqual({ width: { min: 100, max: 300 }, height: { min: 170, max: 670 }, depth: { min: 20, max: 300 } });
    expect(folded.defaultDimensions).toEqual({ width: 140, height: 370, depth: 90 });
    expect(validateDimensions(folded.defaultDimensions, folded.limits)).toEqual({});
  });

  it('offers no handles, 30–60 g/m² paper and no printed bottom allowance', () => {
    expect(getSupportedHandleTypes(folded)).toEqual([]);
    expect(folded.handleVariants).toHaveLength(1);
    expect(folded.handleVariants[0].grammage).toMatchObject({ min: 30, max: 60 });
    expect(folded.handleVariants[0].paperTypes).toContain(folded.handleVariants[0].defaultPaperType);
    expect(folded.extendToBottomAvailable).toBe(false);
    expect(BAG_TYPES.BLOCK.extendToBottomAvailable).toBe(true);
  });

  it('enforces the hard maximum gusset ≤ width (no 140 mm machine cap)', () => {
    expect(validateDimensions({ width: 100, height: 300, depth: 120 }, folded.limits)).toEqual({ depth: 'DEPTH_EXCEEDS_WIDTH' });
    expect(validateDimensions({ width: 300, height: 300, depth: 200 }, folded.limits)).toEqual({});
  });

  it('warns outside the recommended gusset 0.4–0.7·W instead of the block-bottom warnings', () => {
    expect(getDimensionWarningsFor('FOLDED', { width: 140, depth: 90 })).toEqual([]);
    expect(getDimensionWarningsFor('FOLDED', { width: 100, depth: 100 })).toEqual(['GUSSET_OUTSIDE_RECOMMENDED']);
    expect(getDimensionWarningsFor('FOLDED', { width: 200, depth: 60 })).toEqual(['GUSSET_OUTSIDE_RECOMMENDED']);
    expect(getDimensionWarningsFor('BLOCK', { width: 100, depth: 100 })).toEqual(['BOTTOM_TRAPEZOID_DEGENERATE']);
  });
});

describe('changeProductType', () => {
  it('fits a block-bottom configuration to the gusseted-bag bag and reports every change', () => {
    const source = blockWithEverything();
    const { configuration, adjustments } = changeProductType(source, 'FOLDED');
    expect(configuration.productType).toBe('FOLDED');
    expect(configuration.id).toBe(source.id);
    expect(configuration.handle).toBeNull();
    expect(configuration.dimensions).toEqual({ width: 300, height: 450, depth: 150 });
    expect(configuration.paper).toEqual({ ...source.paper, grammage: 60 });
    expect(adjustments).toEqual([
      { field: 'handle', from: 'TWISTED_PAPER' },
      { field: 'dimension', key: 'width', from: 320, to: 300 },
      { field: 'grammage', from: 100, to: 60 },
      { field: 'glueFlap', from: 10, to: 15 },
      { field: 'extendToBottom', targets: ['FRONT', 'LEFT', 'WRAP:base'] },
    ]);
  });

  it('keeps artwork, print colours and the layout, and drops "extend to bottom"', () => {
    const source = blockWithEverything();
    const { configuration } = changeProductType(source, 'FOLDED');
    expect(configuration.panels.FRONT.artwork).toBe(artwork);
    expect(configuration.panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: false });
    expect(configuration.panels.LEFT.placement).toMatchObject({ mode: 'CUSTOM', extendToBottom: false });
    // Every whole-bag layer is kept (order, ids, artwork); none extends to the bottom any more.
    expect(configuration.wrapLayers.map((layer) => layer.id)).toEqual(['base', 'logo']);
    expect(configuration.wrapLayers.every((layer) => layer.artwork === artwork)).toBe(true);
    expect(configuration.wrapLayers.map((layer) => layer.placement.extendToBottom)).toEqual([false, false]);
    expect(configuration.wrapLayers[1]).toBe(source.wrapLayers[1]);
    expect(configuration.print).toEqual(source.print);
    expect(configuration.artworkLayout).toBe(source.artworkLayout);
  });

  it('keeps a glue flap the user chose (clamped into the new range), used as the seam overlap s', () => {
    const chosen = { ...blockWithEverything(), glueFlapWidth: 18 };
    const { configuration, adjustments } = changeProductType(chosen, 'FOLDED');
    expect(configuration.glueFlapWidth).toBe(18);
    expect(adjustments.some((a) => a.field === 'glueFlap')).toBe(false);
    expect(buildDieline(configuration).sheet.width).toBe(2 * 300 + 2 * 150 + 18);
  });

  it('keeps a CUSTOM image where it was on the wall when the bottom extension is dropped', () => {
    const { configuration } = changeProductType(blockWithEverything(), 'FOLDED');
    const placement = configuration.panels.LEFT.placement;
    if (placement.mode !== 'CUSTOM') throw new Error('expected CUSTOM');
    // Extended area of LEFT (150 × (450 + 90)) centred at y = 180; the image centre was at 160 → now 160 − 225 = −65.
    expect(placement.offsetY).toBeCloseTo(-65, 9);
  });

  it('switches back without re-adding what the gusseted-bag bag dropped, and is a no-op for the same type', () => {
    const folded = changeProductType(blockWithEverything(), 'FOLDED').configuration;
    const back = changeProductType(folded, 'BLOCK');
    expect(back.configuration.productType).toBe('BLOCK');
    expect(back.configuration.dimensions).toEqual(folded.dimensions);
    expect(back.configuration.handle).toBeNull();
    // The gusseted default seam overlap (15) goes back to the block default glue flap (10).
    expect(back.adjustments).toEqual([{ field: 'glueFlap', from: 15, to: 10 }]);
    expect(back.configuration.glueFlapWidth).toBe(10);
    expect(changeProductType(folded, 'FOLDED')).toEqual({ configuration: folded, adjustments: [] });
  });
});
