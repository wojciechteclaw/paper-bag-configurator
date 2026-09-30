// Formatting helpers of the export builders. Pure (Intl only), no DOM.

import { getDimensionsSlug } from '../domain/dimensionNotation';
import type { BagConfiguration } from '../domain/types';
import { createNumberFormatter } from '../i18n/numberFormat';

/** Minimal translate function (i18next's `t` fits it). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ExportContext = {
  t: Translate;
  /** UI language used for number formatting ('pl' | 'en' | 'de'). */
  language: string;
};

/** Formats a number with up to `maxDigits` decimals in the UI language (no grouping below 10 000 in Polish). */
export function formatNumber(value: number, language: string, maxDigits = 1): string {
  return createNumberFormatter(language, { maximumFractionDigits: maxDigits, minimumFractionDigits: 0 })(value);
}

/** Ratio 0–1 → "12,3 %" / "12.3%" style percentage with fixed decimals. */
export function formatPercent(ratio: number, language: string, digits = 1): string {
  return createNumberFormatter(language, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })(ratio);
}

/** Rounds to `digits` decimals (for spreadsheet cells, which keep numbers numeric). */
export const round = (value: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Size part of file names (`getDimensionsSlug`): W×H×D, or W+F×H for the gusseted bag. */
export const dimensionsSlug = getDimensionsSlug;

/** File base name like `torba-klockowa-200x400x150` or `torba-faldowa-140+90x370` (as the size is written in the UI). */
export function exportFileBaseName(configuration: Pick<BagConfiguration, 'productType' | 'dimensions'>, t: Translate) {
  return `${t(`export.fileName.${configuration.productType}`)}-${dimensionsSlug(configuration)}`;
}
