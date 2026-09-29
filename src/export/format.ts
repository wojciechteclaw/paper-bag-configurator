// Formatting helpers of the export builders. Pure (Intl only), no DOM.

import type { BagConfiguration } from '../domain/types';

/** Minimal translate function (i18next's `t` fits it). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ExportContext = {
  t: Translate;
  /** UI language used for number formatting ('pl' | 'en'). */
  language: string;
};

const locale = (language: string) => (language.startsWith('pl') ? 'pl-PL' : 'en-GB');

/** Formats a number with up to `maxDigits` decimals in the UI language (no grouping below 10 000 in Polish). */
export function formatNumber(value: number, language: string, maxDigits = 1): string {
  return new Intl.NumberFormat(locale(language), { maximumFractionDigits: maxDigits, minimumFractionDigits: 0 }).format(
    value,
  );
}

/** Ratio 0–1 → "12,3 %" / "12.3%" style percentage with fixed decimals. */
export function formatPercent(ratio: number, language: string, digits = 1): string {
  return new Intl.NumberFormat(locale(language), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/** Rounds to `digits` decimals (for spreadsheet cells, which keep numbers numeric). */
export const round = (value: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** File base name like `torba-klockowa-200x400x150` (W × H × D, as in the UI). */
export function exportFileBaseName(configuration: Pick<BagConfiguration, 'productType' | 'dimensions'>, t: Translate) {
  const { width, height, depth } = configuration.dimensions;
  return `${t(`export.fileName.${configuration.productType}`)}-${width}x${height}x${depth}`;
}
