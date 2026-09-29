import { describe, expect, it } from 'vitest';
import { createNumberFormatter, intlLocale } from './numberFormat';

describe('createNumberFormatter', () => {
  it('uses a decimal comma and space grouping in German', () => {
    expect(createNumberFormatter('de', { maximumFractionDigits: 1 })(1234567.25)).toBe('1 234 567,3');
    expect(createNumberFormatter('de', { style: 'percent', maximumFractionDigits: 1 })(0.123)).toBe('12,3 %');
  });

  it('keeps the Polish and English conventions', () => {
    expect(createNumberFormatter('pl', { maximumFractionDigits: 1 })(30000.5)).toBe('30 000,5');
    expect(createNumberFormatter('en', { maximumFractionDigits: 1 })(30000.5)).toBe('30,000.5');
  });

  it('maps UI languages to Intl locales', () => {
    expect(intlLocale('de')).toBe('de-DE');
    expect(intlLocale('de-AT')).toBe('de-DE');
    expect(intlLocale('pl')).toBe('pl-PL');
    expect(intlLocale('xx')).toBe('en-GB');
  });
});
