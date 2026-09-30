// Compact serialization of a swatch library for local storage (docs/SPEC.md §4g). Pure TS.

import { normalizeHex } from '../printCoverage/color';
import type { Swatch, SwatchColorModel, SwatchColorType, SwatchLibrary, SwatchSkipReason } from './types';

const FORMAT_VERSION = 1;

const MODELS: readonly SwatchColorModel[] = ['RGB', 'CMYK', 'LAB', 'GRAY'];
const COLOR_TYPES: readonly SwatchColorType[] = ['GLOBAL', 'SPOT', 'NORMAL'];
const SKIP_REASONS: readonly SwatchSkipReason[] = ['UNSUPPORTED_MODEL', 'MALFORMED', 'UNNAMED', 'DUPLICATE', 'LIMIT'];

/** name, group, model, colour type, L, a, b, hex, approximate (0/1). */
type StoredSwatch = [string, string | null, SwatchColorModel, SwatchColorType, number, number, number, string, 0 | 1];

type StoredLibrary = {
  v: number;
  name: string;
  fileName: string;
  skipped: Partial<Record<SwatchSkipReason, number>>;
  swatches: StoredSwatch[];
};

const round = (value: number) => Math.round(value * 1000) / 1000;

export function serializeSwatchLibrary(library: SwatchLibrary): string {
  const stored: StoredLibrary = {
    v: FORMAT_VERSION,
    name: library.name,
    fileName: library.fileName,
    skipped: library.skipped,
    swatches: library.swatches.map((s) => [
      s.name,
      s.group,
      s.model,
      s.colorType,
      round(s.lab.l),
      round(s.lab.a),
      round(s.lab.b),
      s.hex,
      s.approximate ? 1 : 0,
    ]),
  };
  return JSON.stringify(stored);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function readSwatch(value: unknown): Swatch | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const [name, group, model, colorType, l, a, b, hex, approximate] = value as unknown[];
  const normalizedHex = typeof hex === 'string' ? normalizeHex(hex) : null;
  if (
    typeof name !== 'string' ||
    name === '' ||
    (group !== null && typeof group !== 'string') ||
    !MODELS.includes(model as SwatchColorModel) ||
    !COLOR_TYPES.includes(colorType as SwatchColorType) ||
    !isFiniteNumber(l) ||
    !isFiniteNumber(a) ||
    !isFiniteNumber(b) ||
    !normalizedHex
  ) {
    return null;
  }
  return {
    name,
    group,
    model: model as SwatchColorModel,
    colorType: colorType as SwatchColorType,
    lab: { l, a, b },
    hex: normalizedHex,
    approximate: approximate === 1,
  };
}

/** Inverse of `serializeSwatchLibrary`; null for anything that is not a valid stored library (never throws). */
export function deserializeSwatchLibrary(text: string | null | undefined): SwatchLibrary | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const stored = data as Partial<StoredLibrary>;
  if (stored.v !== FORMAT_VERSION || typeof stored.name !== 'string' || typeof stored.fileName !== 'string') return null;
  if (!Array.isArray(stored.swatches)) return null;
  const swatches: Swatch[] = [];
  for (const entry of stored.swatches) {
    const swatch = readSwatch(entry);
    if (!swatch) return null;
    swatches.push(swatch);
  }
  if (swatches.length === 0) return null;
  const skipped: Partial<Record<SwatchSkipReason, number>> = {};
  if (typeof stored.skipped === 'object' && stored.skipped !== null) {
    for (const reason of SKIP_REASONS) {
      const count = (stored.skipped as Record<string, unknown>)[reason];
      if (isFiniteNumber(count) && count > 0) skipped[reason] = Math.floor(count);
    }
  }
  return { name: stored.name, fileName: stored.fileName, swatches, skipped };
}
