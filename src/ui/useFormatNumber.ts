import { useTranslation } from 'react-i18next';

/** Locale-aware number formatting for the current UI language (e.g. "30 000" in PL, "30,000" in EN). */
export function useFormatNumber() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (value: number, maximumFractionDigits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}
