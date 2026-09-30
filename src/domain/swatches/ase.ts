// Adobe Swatch Exchange (.ase) parser (docs/SPEC.md §4g). Pure TS, no DOM.
//
// File layout (all big-endian):
//   'ASEF' · version major u16 · minor u16 · block count u32 · blocks…
//   block = type u16 · data length u32 · data
//     0xC001 group start: name
//     0xC002 group end:   (no data)
//     0x0001 colour:      name · model char[4] ('RGB ', 'CMYK', 'LAB ', 'Gray') · float32 values · colour type u16
//   name = length u16 (UTF-16 code units incl. the 0 terminator) · UTF-16BE code units
// LAB values: L as 0..1 (× 100), a / b as is, relative to D50 (Adobe convention).

import { SWATCH_LIBRARY_RULES } from '../config/productCatalog';
import { pantoneLookupKey } from '../printColors';
import {
  grayToRgb,
  naiveCmykToRgb,
  swatchColorFromLabD50,
  swatchColorFromRgb,
  unitRgbToRgb,
  type SwatchColor,
} from './swatchColor';
import type { Swatch, SwatchColorModel, SwatchColorType, SwatchLibrary, SwatchSkipReason } from './types';

export type AseError = 'EMPTY_FILE' | 'TOO_LARGE' | 'NOT_ASE' | 'UNSUPPORTED_VERSION' | 'TRUNCATED' | 'NO_COLORS';

export type AseParseResult = { ok: true; library: SwatchLibrary } | { ok: false; error: AseError };

export type AseParseOptions = {
  /** Overrides of `SWATCH_LIBRARY_RULES` (tests). */
  maxFileSizeBytes?: number;
  maxEntries?: number;
};

const SIGNATURE = 0x41534546; // 'ASEF'
const BLOCK_GROUP_START = 0xc001;
const BLOCK_GROUP_END = 0xc002;
const BLOCK_COLOR = 0x0001;
const HEADER_BYTES = 12;
const BLOCK_HEADER_BYTES = 6;

const MODELS: Record<string, { model: SwatchColorModel; values: number }> = {
  'RGB ': { model: 'RGB', values: 3 },
  CMYK: { model: 'CMYK', values: 4 },
  'LAB ': { model: 'LAB', values: 3 },
  Gray: { model: 'GRAY', values: 1 },
};

const COLOR_TYPES: readonly SwatchColorType[] = ['GLOBAL', 'SPOT', 'NORMAL'];

/** "Pantone Formula Guide.ase" → "Pantone Formula Guide". */
export function libraryNameFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  return base.replace(/\.ase$/i, '').trim() || base;
}

/** Reads a length-prefixed UTF-16BE name at `offset`; null when it does not fit before `end`. */
function readName(view: DataView, offset: number, end: number): { name: string; next: number } | null {
  if (offset + 2 > end) return null;
  const units = view.getUint16(offset);
  const next = offset + 2 + units * 2;
  if (next > end) return null;
  const codes: number[] = [];
  for (let i = 0; i < units; i++) codes.push(view.getUint16(offset + 2 + i * 2));
  while (codes.length > 0 && codes[codes.length - 1] === 0) codes.pop();
  let name = '';
  for (const code of codes) name += String.fromCharCode(code);
  return { name: name.trim(), next };
}

type ParsedColor = Omit<Swatch, 'group'> | SwatchSkipReason;

function readColor(view: DataView, start: number, end: number): ParsedColor {
  const named = readName(view, start, end);
  if (!named) return 'MALFORMED';
  let offset = named.next;
  if (offset + 4 > end) return 'MALFORMED';
  const code = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
  offset += 4;
  const spec = MODELS[code];
  if (!spec) return 'UNSUPPORTED_MODEL';
  if (offset + spec.values * 4 + 2 > end) return 'MALFORMED';
  const values: number[] = [];
  for (let i = 0; i < spec.values; i++) values.push(view.getFloat32(offset + i * 4));
  if (!values.every(Number.isFinite)) return 'MALFORMED';
  offset += spec.values * 4;
  const colorType = COLOR_TYPES[view.getUint16(offset)] ?? 'NORMAL';
  if (named.name === '') return 'UNNAMED';

  let color: SwatchColor;
  switch (spec.model) {
    case 'RGB':
      color = swatchColorFromRgb(unitRgbToRgb(values[0], values[1], values[2]));
      break;
    case 'CMYK':
      color = swatchColorFromRgb(naiveCmykToRgb(values[0], values[1], values[2], values[3]));
      break;
    case 'LAB':
      color = swatchColorFromLabD50({ l: values[0] * 100, a: values[1], b: values[2] });
      break;
    case 'GRAY':
      color = swatchColorFromRgb(grayToRgb(values[0]));
      break;
  }
  return { name: named.name, model: spec.model, colorType, ...color, approximate: spec.model === 'CMYK' };
}

/**
 * Parses an ASE file into a swatch library. Structural problems (signature, version, truncated blocks) are errors;
 * individual entries that cannot be used (unknown model, bad values, no name, duplicate code, over the limit) are
 * skipped and counted. Duplicates are detected by the Pantone lookup key ("PANTONE 186 C" = "186 C"); the first wins.
 */
export function parseAse(buffer: ArrayBuffer | ArrayBufferView, fileName: string, options: AseParseOptions = {}): AseParseResult {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? SWATCH_LIBRARY_RULES.maxFileSizeBytes;
  const maxEntries = options.maxEntries ?? SWATCH_LIBRARY_RULES.maxEntries;
  const view = ArrayBuffer.isView(buffer)
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);
  const length = view.byteLength;
  if (length === 0) return { ok: false, error: 'EMPTY_FILE' };
  if (length > maxFileSizeBytes) return { ok: false, error: 'TOO_LARGE' };
  if (length < HEADER_BYTES || view.getUint32(0) !== SIGNATURE) return { ok: false, error: 'NOT_ASE' };
  if (view.getUint16(4) !== 1) return { ok: false, error: 'UNSUPPORTED_VERSION' };

  const blockCount = view.getUint32(8);
  const swatches: Swatch[] = [];
  const keys = new Set<string>();
  const skipped: Partial<Record<SwatchSkipReason, number>> = {};
  const skip = (reason: SwatchSkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  let group: string | null = null;
  let offset = HEADER_BYTES;

  for (let i = 0; i < blockCount; i++) {
    if (offset + BLOCK_HEADER_BYTES > length) return { ok: false, error: 'TRUNCATED' };
    const type = view.getUint16(offset);
    const dataLength = view.getUint32(offset + 2);
    const start = offset + BLOCK_HEADER_BYTES;
    const end = start + dataLength;
    if (end > length) return { ok: false, error: 'TRUNCATED' };
    offset = end;

    if (type === BLOCK_GROUP_START) {
      group = readName(view, start, end)?.name || null;
    } else if (type === BLOCK_GROUP_END) {
      group = null;
    } else if (type === BLOCK_COLOR) {
      const parsed = readColor(view, start, end);
      if (typeof parsed === 'string') {
        skip(parsed);
        continue;
      }
      const key = pantoneLookupKey(parsed.name);
      if (keys.has(key)) {
        skip('DUPLICATE');
      } else if (swatches.length >= maxEntries) {
        skip('LIMIT');
      } else {
        keys.add(key);
        swatches.push({ ...parsed, group });
      }
    }
    // Unknown block types are ignored (their length is known, so parsing continues).
  }

  if (swatches.length === 0) return { ok: false, error: 'NO_COLORS' };
  return { ok: true, library: { name: libraryNameFromFileName(fileName), fileName, swatches, skipped } };
}
