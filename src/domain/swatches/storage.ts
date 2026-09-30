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

/** A stored library object (format v1), or null when invalid. */
function readLibrary(data: unknown): SwatchLibrary | null {
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

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Inverse of `serializeSwatchLibrary`; null for anything that is not a valid stored library (never throws). */
export function deserializeSwatchLibrary(text: string | null | undefined): SwatchLibrary | null {
  return readLibrary(parseJson(text));
}

/** Storage container of several libraries (v2): `{ v: 2, libraries: [<v1 library object>…] }`. */
const CONTAINER_VERSION = 2;

/**
 * Serializes libraries in order while they fit into `maxChars` together (docs/SPEC.md §4g); a library that does not
 * fit is left out (it stays session-only) and later, smaller ones may still be stored. `stored[i]` tells whether
 * `libraries[i]` is in `text`; `text` is null when nothing is stored.
 */
export function packSwatchLibraries(
  libraries: readonly SwatchLibrary[],
  maxChars: number,
): { text: string | null; stored: boolean[] } {
  const head = `{"v":${CONTAINER_VERSION},"libraries":[`;
  const tail = ']}';
  const parts: string[] = [];
  let length = head.length + tail.length;
  const stored = libraries.map((library) => {
    const part = serializeSwatchLibrary(library);
    const extra = part.length + (parts.length > 0 ? 1 : 0);
    if (length + extra > maxChars) return false;
    parts.push(part);
    length += extra;
    return true;
  });
  return { text: parts.length > 0 ? head + parts.join(',') + tail : null, stored };
}

/**
 * Libraries from storage: the v2 container, or a single v1 library (the format before several libraries were
 * allowed — migrated transparently). Invalid entries are dropped; invalid data gives []. Never throws.
 */
export function deserializeSwatchLibraries(text: string | null | undefined): SwatchLibrary[] {
  const data = parseJson(text);
  if (typeof data !== 'object' || data === null) return [];
  const container = data as { v?: unknown; libraries?: unknown };
  if (container.v === CONTAINER_VERSION && Array.isArray(container.libraries)) {
    return container.libraries.map(readLibrary).filter((library): library is SwatchLibrary => library !== null);
  }
  const single = readLibrary(data);
  return single ? [single] : [];
}
