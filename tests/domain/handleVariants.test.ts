import { describe, expect, it } from 'vitest';
import { BAG_TYPES, DIMENSION_STEP_MM, type HandleVariantDefinition } from '../../src/domain/config/productCatalog';
import { createHandle } from '../../src/domain/factories';
import {
  constrainPaperToVariant,
  findHandleVariantDefinition,
  findStandardSize,
  getHandleVariant,
  getHandleVariantDefinition,
  getStandardSizeViolations,
  getSupportedHandleTypes,
} from '../../src/domain/handleVariants';
import type { Paper } from '../../src/domain/types';

const BLOCK = BAG_TYPES.BLOCK;
const variant = (v: HandleVariantDefinition['variant']) => findHandleVariantDefinition(BLOCK, v)!;

const paper: Paper = { type: 'KRAFT', color: 'WHITE', grammage: 80, fscCertified: true, moistureBarrier: false };

describe('catalog handle variants', () => {
  it('offers no handle, flat and twisted handles for block bags; NONE first', () => {
    expect(BLOCK.handleVariants.map((v) => v.variant)).toEqual(['NONE', 'FLAT_PAPER', 'TWISTED_PAPER']);
    expect(getSupportedHandleTypes(BLOCK)).toEqual(['FLAT_PAPER', 'TWISTED_PAPER']);
    expect(getSupportedHandleTypes(BAG_TYPES.FOLDED)).toEqual([]);
  });

  it('matches the reference offer', () => {
    expect(variant('NONE').grammage).toMatchObject({ min: 50, max: 120 });
    expect(variant('NONE').paperTypes).toEqual(['KRAFT', 'RECYCLED', 'COATED', 'FILM_COATED', 'GREASEPROOF']);
    expect(variant('NONE').moistureBarrierAvailable).toBe(true);
    expect(variant('FLAT_PAPER').grammage).toMatchObject({ min: 70, max: 110 });
    expect(variant('FLAT_PAPER').paperTypes).toEqual(['KRAFT', 'RECYCLED']);
    expect(variant('FLAT_PAPER').standardSizes).toHaveLength(19);
    expect(variant('TWISTED_PAPER').grammage).toMatchObject({ min: 70, max: 120 });
    expect(variant('TWISTED_PAPER').standardSizes).toEqual([]);
  });

  it.each(Object.values(BAG_TYPES).flatMap((type) => type.handleVariants.map((v) => [type.type, v.variant, v] as const)))(
    '%s / %s is internally consistent',
    (_type, _variant, definition) => {
      const { grammage } = definition;
      expect(definition.paperTypes).toContain(definition.defaultPaperType);
      expect(grammage.default).toBeGreaterThanOrEqual(grammage.min);
      expect(grammage.default).toBeLessThanOrEqual(grammage.max);
      expect((grammage.default - grammage.min) % grammage.step).toBe(0);
      expect((grammage.max - grammage.min) % grammage.step).toBe(0);
      const ids = definition.standardSizes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const { dimensions } of definition.standardSizes) {
        expect(dimensions.depth).toBeLessThanOrEqual(dimensions.width);
        for (const value of Object.values(dimensions)) expect(value % DIMENSION_STEP_MM).toBe(0);
      }
    },
  );
});

describe('getHandleVariant / getHandleVariantDefinition', () => {
  it('maps null to NONE and a handle to its type', () => {
    expect(getHandleVariant(null)).toBe('NONE');
    expect(getHandleVariant(createHandle('FLAT_PAPER'))).toBe('FLAT_PAPER');
  });

  it('returns the variant options for the current handle', () => {
    expect(getHandleVariantDefinition(BLOCK, null).variant).toBe('NONE');
    expect(getHandleVariantDefinition(BLOCK, createHandle('TWISTED_PAPER')).variant).toBe('TWISTED_PAPER');
  });

  it('falls back to the first variant when the bag type does not offer the handle', () => {
    expect(findHandleVariantDefinition(BAG_TYPES.FOLDED, 'FLAT_PAPER')).toBeUndefined();
    expect(getHandleVariantDefinition(BAG_TYPES.FOLDED, createHandle('FLAT_PAPER')).variant).toBe('NONE');
  });
});

describe('constrainPaperToVariant', () => {
  it('returns the same object and no adjustments when the paper fits', () => {
    const result = constrainPaperToVariant(paper, variant('FLAT_PAPER'));
    expect(result.paper).toBe(paper);
    expect(result.adjustments).toEqual([]);
  });

  it('replaces an unavailable paper type with the variant default', () => {
    const result = constrainPaperToVariant({ ...paper, type: 'GREASEPROOF' }, variant('TWISTED_PAPER'));
    expect(result.paper.type).toBe('KRAFT');
    expect(result.adjustments).toEqual([{ field: 'type', from: 'GREASEPROOF', to: 'KRAFT' }]);
  });

  it.each([
    ['FLAT_PAPER', 50, 70],
    ['FLAT_PAPER', 120, 110],
    ['TWISTED_PAPER', 120, 120],
    ['TWISTED_PAPER', 60, 70],
    ['NONE', 50, 50],
  ] as const)('clamps grammage into %s: %s → %s', (v, from, to) => {
    const result = constrainPaperToVariant({ ...paper, grammage: from }, variant(v));
    expect(result.paper.grammage).toBe(to);
    expect(result.adjustments).toEqual(from === to ? [] : [{ field: 'grammage', from, to }]);
  });

  it('drops the moisture barrier where not offered, keeps it where it is', () => {
    const withBarrier = { ...paper, moistureBarrier: true };
    expect(constrainPaperToVariant(withBarrier, variant('NONE')).adjustments).toEqual([]);
    const result = constrainPaperToVariant(withBarrier, variant('FLAT_PAPER'));
    expect(result.paper.moistureBarrier).toBe(false);
    expect(result.adjustments).toEqual([{ field: 'moistureBarrier', from: true, to: false }]);
  });

  it('keeps colour and FSC and does not mutate the input', () => {
    const input = { ...paper, type: 'COATED' as const, grammage: 50, moistureBarrier: true };
    const result = constrainPaperToVariant(input, variant('FLAT_PAPER'));
    expect(result.paper).toEqual({ ...paper, type: 'KRAFT', grammage: 70, moistureBarrier: false });
    expect(result.adjustments.map((a) => a.field)).toEqual(['type', 'grammage', 'moistureBarrier']);
    expect(input.type).toBe('COATED');
  });
});

describe('findStandardSize', () => {
  const sizes = variant('FLAT_PAPER').standardSizes;

  it('finds an exact match', () => {
    expect(findStandardSize({ width: 250, depth: 110, height: 280 }, sizes)?.id).toBe('250x110x280');
  });

  it('returns null for a custom size', () => {
    expect(findStandardSize({ width: 250, depth: 110, height: 285 }, sizes)).toBeNull();
    expect(findStandardSize({ width: 200, depth: 150, height: 400 }, [])).toBeNull();
  });
});

describe('getStandardSizeViolations', () => {
  const sizes = variant('FLAT_PAPER').standardSizes;
  const byId = (id: string) => sizes.find((s) => s.id === id)!;

  it('accepts sizes within the limits (boundaries included)', () => {
    expect(getStandardSizeViolations(byId('180x85x230'), BLOCK.limits)).toEqual([]);
    const atLimits = { id: 'x', dimensions: { width: 450, depth: 40, height: 470 } };
    expect(getStandardSizeViolations(atLimits, BLOCK.limits)).toEqual([]);
  });

  it('reports every dimension outside the limits', () => {
    expect(getStandardSizeViolations({ id: 'x', dimensions: { width: 500, depth: 170, height: 280 } }, BLOCK.limits)).toEqual([
      { key: 'width', value: 500, range: { min: 75, max: 450 } },
    ]);
    const both = { id: 'y', dimensions: { width: 460, depth: 170, height: 480 } };
    expect(getStandardSizeViolations(both, BLOCK.limits).map((v) => v.key)).toEqual(['width', 'height']);
  });

  it('keeps every catalogue size selectable (limits cover the client size table up to 450 × 170 × 470)', () => {
    const unavailable = (v: HandleVariantDefinition) =>
      v.standardSizes.filter((s) => getStandardSizeViolations(s, BLOCK.limits).length > 0).map((s) => s.id);
    expect(unavailable(variant('NONE'))).toEqual([]);
    expect(unavailable(variant('FLAT_PAPER'))).toEqual([]);
  });
});
