import { describe, expect, it } from 'vitest';
import dielineEn from './locales/dieline.en.json';
import dielinePl from './locales/dieline.pl.json';
import en from './locales/en.json';
import exportEn from './locales/export.en.json';
import exportPl from './locales/export.pl.json';
import pl from './locales/pl.json';
import { mergeResources } from './index';

type Tree = { [key: string]: unknown };
const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Flattens a nested translation tree into dotted i18next key paths. */
function flattenKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isTree(value) ? flattenKeys(value, path) : [path];
  });
}

describe('i18n locale key parity', () => {
  it('pl.json and en.json expose the same keys', () => {
    expect(flattenKeys(pl).sort()).toEqual(flattenKeys(en).sort());
  });

  it('dieline.pl.json and dieline.en.json expose the same keys', () => {
    expect(flattenKeys(dielinePl).sort()).toEqual(flattenKeys(dielineEn).sort());
  });

  it('merged pl and en resources (main + dieline) expose the same keys', () => {
    const mergedPl = mergeResources(pl, dielinePl);
    const mergedEn = mergeResources(en, dielineEn);
    expect(flattenKeys(mergedPl).sort()).toEqual(flattenKeys(mergedEn).sort());
  });

  it('dieline locale files do not silently shadow main-locale keys with a different shape', () => {
    // mergeResources lets feature keys win; the merged tree should still contain every leaf
    // that either source declares, i.e. no dieline key overwrites a main-tree subtree entirely.
    const mergedEn = mergeResources(en, dielineEn);
    const expectedKeys = new Set([...flattenKeys(en), ...flattenKeys(dielineEn)]);
    expect(flattenKeys(mergedEn).sort()).toEqual([...expectedKeys].sort());
  });

  it('export.pl.json and export.en.json expose the same keys without shadowing main keys', () => {
    expect(flattenKeys(exportPl).sort()).toEqual(flattenKeys(exportEn).sort());
    const mergedEn = mergeResources(en, exportEn);
    expect(flattenKeys(mergedEn).sort()).toEqual([...new Set([...flattenKeys(en), ...flattenKeys(exportEn)])].sort());
  });
});
