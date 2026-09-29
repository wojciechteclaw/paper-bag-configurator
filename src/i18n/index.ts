import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import coverageEn from './locales/coverage.en.json';
import coveragePl from './locales/coverage.pl.json';
import dielineEn from './locales/dieline.en.json';
import dielinePl from './locales/dieline.pl.json';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

type Tree = { [key: string]: unknown };
const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merges feature locale files into the main translation resources (feature keys win on conflicts). */
export function mergeResources(...sources: Tree[]): Tree {
  const result: Tree = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      const current = result[key];
      result[key] = isTree(current) && isTree(value) ? mergeResources(current, value) : value;
    }
  }
  return result;
}

void i18n.use(initReactI18next).init({
  resources: {
    pl: { translation: mergeResources(pl, dielinePl, coveragePl) },
    en: { translation: mergeResources(en, dielineEn, coverageEn) },
  },
  lng: 'pl',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
