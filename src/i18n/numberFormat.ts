// Locale-aware number formatting shared by the UI and the export builders. Pure (Intl only), no i18next import.

const INTL_LOCALES: Record<string, string> = { pl: 'pl-PL', en: 'en-GB', de: 'de-DE' };

/** BCP 47 locale used for Intl formatting of a UI language ('pl' | 'en' | 'de', region subtags tolerated). */
export function intlLocale(language: string): string {
  return INTL_LOCALES[language.slice(0, 2).toLowerCase()] ?? 'en-GB';
}

const NBSP = ' ';

/**
 * Number formatter for a UI language: "1 234,5" (PL), "1,234.5" (EN), "1 234,5" (DE — decimal comma with a
 * no-break space as the thousands separator, DIN 5008 style, instead of the easily misread "1.234,5").
 */
export function createNumberFormatter(language: string, options?: Intl.NumberFormatOptions): (value: number) => string {
  const format = new Intl.NumberFormat(intlLocale(language), options);
  if (!language.toLowerCase().startsWith('de')) return (value) => format.format(value);
  return (value) =>
    format
      .formatToParts(value)
      .map((part) => (part.type === 'group' ? NBSP : part.value))
      .join('');
}
