import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import coverageDe from './locales/coverage.de.json';
import coverageEn from './locales/coverage.en.json';
import coveragePl from './locales/coverage.pl.json';
import de from './locales/de.json';
import dielineDe from './locales/dieline.de.json';
import dielineEn from './locales/dieline.en.json';
import dielinePl from './locales/dieline.pl.json';
import en from './locales/en.json';
import exportDe from './locales/export.de.json';
import exportEn from './locales/export.en.json';
import exportPl from './locales/export.pl.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = ['pl', 'en', 'de'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'pl';

/** localStorage key of the language the user picked last. */
export const LANGUAGE_STORAGE_KEY = 'paper-bag-configurator.language';

export const isSupportedLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** Stored language, or the default when none is stored or storage is unavailable (private mode, blocked site data). */
export function readStoredLanguage(): Language {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function storeLanguage(language: string) {
  if (!isSupportedLanguage(language)) return;
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
}

/** Keeps <html lang> and the document title in step with the UI language (screen readers, hyphenation, tab title). */
function syncDocument(language: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.title = i18n.t('app.title');
}

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
    pl: { translation: mergeResources(pl, dielinePl, coveragePl, exportPl) },
    en: { translation: mergeResources(en, dielineEn, coverageEn, exportEn) },
    de: { translation: mergeResources(de, dielineDe, coverageDe, exportDe) },
  },
  lng: readStoredLanguage(),
  supportedLngs: [...SUPPORTED_LANGUAGES],
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  storeLanguage(language);
  syncDocument(language);
});
syncDocument(i18n.language);

export default i18n;
