import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

void i18n.use(initReactI18next).init({
  resources: { pl: { translation: pl }, en: { translation: en } },
  lng: 'pl',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
