import { useTranslation } from 'react-i18next';
import { createNumberFormatter } from '../i18n/numberFormat';

/** Locale-aware number formatting for the current UI language (e.g. "30 000" in PL, "30,000" in EN, "30 000" in DE). */
export function useFormatNumber() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (value: number, maximumFractionDigits = 0) =>
    createNumberFormatter(locale, { maximumFractionDigits })(value);
}
