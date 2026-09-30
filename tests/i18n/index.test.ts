import { describe, expect, it } from 'vitest';
import coverageDe from '../../src/i18n/locales/coverage.de.json';
import coverageEn from '../../src/i18n/locales/coverage.en.json';
import coveragePl from '../../src/i18n/locales/coverage.pl.json';
import de from '../../src/i18n/locales/de.json';
import dielineDe from '../../src/i18n/locales/dieline.de.json';
import dielineEn from '../../src/i18n/locales/dieline.en.json';
import dielinePl from '../../src/i18n/locales/dieline.pl.json';
import en from '../../src/i18n/locales/en.json';
import exportDe from '../../src/i18n/locales/export.de.json';
import exportEn from '../../src/i18n/locales/export.en.json';
import exportPl from '../../src/i18n/locales/export.pl.json';
import pl from '../../src/i18n/locales/pl.json';
import { mergeResources, SUPPORTED_LANGUAGES, type Language } from '../../src/i18n/index';

type Tree = { [key: string]: unknown };
const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Flattens a nested translation tree into dotted i18next key paths with their string values. */
function flatten(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isTree(value) ? flatten(value, path) : [[path, String(value)]];
  });
}

const flattenKeys = (tree: Tree) => flatten(tree).map(([key]) => key);

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Keys with i18next plural suffixes collapsed to their base key, mapped to the placeholders used by any of the forms.
 * Languages legitimately differ in plural forms (PL: one/few/many/other, DE: one/other), so parity is checked on base keys.
 */
function placeholdersByBaseKey(tree: Tree): Map<string, string[]> {
  const result = new Map<string, Set<string>>();
  for (const [key, value] of flatten(tree)) {
    const base = key.replace(PLURAL_SUFFIX, '');
    const set = result.get(base) ?? new Set<string>();
    for (const match of value.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)) set.add(match[1]);
    result.set(base, set);
  }
  return new Map([...result].map(([key, set]) => [key, [...set].sort()]));
}

const FAMILIES: Record<string, Record<Language, Tree>> = {
  main: { pl, en, de },
  dieline: { pl: dielinePl, en: dielineEn, de: dielineDe },
  coverage: { pl: coveragePl, en: coverageEn, de: coverageDe },
  export: { pl: exportPl, en: exportEn, de: exportDe },
};

const OTHER_LANGUAGES = SUPPORTED_LANGUAGES.filter((lng) => lng !== 'pl');

describe('i18n locale key parity', () => {
  it('supports PL, EN and DE', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['pl', 'en', 'de']);
  });

  describe.each(Object.entries(FAMILIES))('%s locale files', (_family, files) => {
    const reference = placeholdersByBaseKey(files.pl);

    it.each(OTHER_LANGUAGES)('%s has exactly the keys of pl (no missing or extra keys)', (lng) => {
      expect([...placeholdersByBaseKey(files[lng]).keys()].sort()).toEqual([...reference.keys()].sort());
    });

    it.each(OTHER_LANGUAGES)('%s uses the same {{placeholders}} as pl for every key', (lng) => {
      expect(Object.fromEntries(placeholdersByBaseKey(files[lng]))).toEqual(Object.fromEntries(reference));
    });

    it.each(SUPPORTED_LANGUAGES)('%s has every plural form its language needs and no empty strings', (lng) => {
      const entries = flatten(files[lng]);
      const keys = new Set(entries.map(([key]) => key));
      const categories = new Intl.PluralRules(lng).resolvedOptions().pluralCategories;
      const pluralBases = new Set(entries.map(([key]) => key).filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, '')));
      for (const base of pluralBases) {
        for (const category of categories) expect(keys, `${lng}: ${base}_${category}`).toContain(`${base}_${category}`);
      }
      for (const [key, value] of entries) expect(value.trim(), `${lng}: ${key}`).not.toBe('');
    });
  });

  it.each(SUPPORTED_LANGUAGES)('feature locale files do not shadow main-locale keys (%s)', (lng) => {
    // mergeResources lets feature keys win; the merged tree must still contain every leaf that any source declares.
    const sources = Object.values(FAMILIES).map((files) => files[lng]);
    const merged = mergeResources(...sources);
    const expected = new Set(sources.flatMap(flattenKeys));
    expect(flattenKeys(merged).sort()).toEqual([...expected].sort());
  });

  it('merged resources expose the same base keys in every language', () => {
    const merged = (lng: Language) => placeholdersByBaseKey(mergeResources(...Object.values(FAMILIES).map((files) => files[lng])));
    const reference = [...merged('pl').keys()].sort();
    for (const lng of OTHER_LANGUAGES) expect([...merged(lng).keys()].sort()).toEqual(reference);
  });
});
