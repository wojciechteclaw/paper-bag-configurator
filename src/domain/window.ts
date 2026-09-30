// Film window ("okienko") in the FRONT wall of the gusseted bag — geometry, limits, factories and validation. Pure TS.
// Client decisions [K] 30.09.2026, derived margins [Z]: docs/PRODUCTION.md §13.6, docs/SPEC.md §2b.
//
// Everything is in FRONT's panel-local mm (seen from outside, x = 0 at the LEFT edge, y = 0 = the bottom fold line,
// the mouth at y = H). The opening is always centred horizontally. The film is glued on the inside and overlaps the
// paper by `filmOverlap` on every closed side of the opening; the panoramic strip is open at the top, so its film
// ends at the mouth. Paper margins: the film edge stays `WINDOW_RULES.paperSafetyMargin` from FRONT's side creases
// (x = 0, x = W), from the top of the bottom strip d (y = d) and — rectangle — from the mouth (y = H), i.e. the opening
// edge is at least m = filmOverlap + paperSafetyMargin from them.

import { WINDOW_RULES, type Range } from './config/productCatalog';
import { getConfiguredBottomFold } from './bottomFold';
import { getBottomFoldDepth, type GussetedDimensions } from './geometry/gussetedBag';
import type { BagConfiguration, BagWindow, WindowMaterial, WindowType } from './types';

/** An axis-aligned rectangle in FRONT's panel-local mm (x, y = lower-left corner). */
export type WindowRect = { x: number; y: number; width: number; height: number };

/** The opening cut from the paper; `openAtTop` = it runs through the mouth edge (panoramic strip, y + height = H). */
export type WindowOpening = WindowRect & { openAtTop: boolean };

/** Editable numeric fields of a window (`height` only for the rectangle; `bottomOffset` = start of either window). */
export type WindowField = 'width' | 'height' | 'bottomOffset' | 'filmOverlap';

export type WindowValueError = 'NOT_A_NUMBER' | 'NOT_INTEGER' | 'BELOW_MIN' | 'ABOVE_MAX';

export type WindowError = { field: WindowField; code: WindowValueError; min: number; max: number };

/** Soft warnings of a valid window. */
export type WindowWarning = 'WINDOW_LARGE_OPENING';

/** W, H and the configured bottom strip d (`bottomFold`; absent = the default d). */
export type WindowDimensions = Pick<GussetedDimensions, 'width' | 'height' | 'bottomFold'>;

/** The dimensions the window limits depend on for a configuration: W, H and its configured bottom strip d. */
export function getWindowDimensions(
  configuration: Pick<BagConfiguration, 'dimensions'> & Partial<Pick<BagConfiguration, 'bottomFoldDepth' | 'productType'>>,
): WindowDimensions {
  const { width, height } = configuration.dimensions;
  return { width, height, bottomFold: getConfiguredBottomFold({ productType: 'FOLDED', ...configuration }) };
}

/** The window of a configuration (null when missing — data saved before windows existed). */
export function getWindow(configuration: Partial<Pick<BagConfiguration, 'window'>>): BagWindow | null {
  return configuration.window ?? null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Same window (type, material and every value of the type; key order and extra fields ignored). */
export function windowsEqual(a: BagWindow | null, b: BagWindow | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.type !== b.type || a.material !== b.material || a.width !== b.width || a.filmOverlap !== b.filmOverlap) return false;
  if (a.type === 'PANORAMIC') return b.type === 'PANORAMIC' && a.bottomOffset === b.bottomOffset;
  return b.type === 'RECTANGLE' && a.height === b.height && a.bottomOffset === b.bottomOffset;
}

/** Minimum paper between the opening edge and a crease / the bottom strip / the mouth: overlap + safety margin, mm. */
export function getWindowMargin(filmOverlap: number): number {
  return filmOverlap + WINDOW_RULES.paperSafetyMargin;
}

/** Lower edge of the panoramic strip: just above the bottom strip d, leaving room for the film overlap and margin. */
function panoramicBottom(dimensions: WindowDimensions, filmOverlap: number): number {
  return getBottomFoldDepth(dimensions) + getWindowMargin(filmOverlap);
}

/**
 * Allowed range of every field for this window on a bag of `dimensions`. The rectangle's `bottomOffset` range depends
 * on its (clamped) height. For the panoramic strip `height` / `bottomOffset` are the derived fixed values (min = max).
 * A max below the min means the window does not fit (not possible within the catalog's dimension limits).
 */
export function getWindowLimits(window: BagWindow, dimensions: WindowDimensions): Record<WindowField, Range> {
  const { width: W, height: H } = dimensions;
  const overlap = clamp(window.filmOverlap, WINDOW_RULES.filmOverlap.min, WINDOW_RULES.filmOverlap.max);
  const m = getWindowMargin(overlap);
  const d = getBottomFoldDepth(dimensions);
  const filmOverlap = { min: WINDOW_RULES.filmOverlap.min, max: WINDOW_RULES.filmOverlap.max };
  const width = { min: WINDOW_RULES.minOpening, max: Math.floor(W - 2 * m) };
  if (window.type === 'PANORAMIC') {
    // The strip starts anywhere from just above the bottom strip up to the minimum opening below the mouth.
    const lowest = Math.ceil(panoramicBottom(dimensions, overlap));
    const bottomOffset = { min: lowest, max: Math.floor(H - WINDOW_RULES.minOpening) };
    const start = clamp(window.bottomOffset ?? lowest, bottomOffset.min, Math.max(bottomOffset.min, bottomOffset.max));
    return {
      width,
      height: { min: H - start, max: H - start },
      bottomOffset,
      filmOverlap,
    };
  }
  const height = { min: WINDOW_RULES.minOpening, max: Math.floor(H - d - 2 * m) };
  const clampedHeight = clamp(window.height, height.min, Math.max(height.min, height.max));
  const bottomOffset = { min: Math.ceil(d + m), max: Math.floor(H - m - clampedHeight) };
  return { width, height, bottomOffset, filmOverlap };
}

/** The opening in FRONT's panel-local mm, centred horizontally. */
export function getWindowOpening(window: BagWindow, dimensions: WindowDimensions): WindowOpening {
  const x = (dimensions.width - window.width) / 2;
  if (window.type === 'PANORAMIC') {
    const y = window.bottomOffset ?? panoramicBottom(dimensions, window.filmOverlap);
    return { x, y, width: window.width, height: Math.max(0, dimensions.height - y), openAtTop: true };
  }
  return { x, y: window.bottomOffset, width: window.width, height: window.height, openAtTop: false };
}

/** The film glued on the inside: the opening grown by the overlap on every closed side (not above the mouth). */
export function getWindowFilm(window: BagWindow, dimensions: WindowDimensions): WindowRect {
  const opening = getWindowOpening(window, dimensions);
  const o = window.filmOverlap;
  const top = opening.openAtTop ? dimensions.height : opening.y + opening.height + o;
  return { x: opening.x - o, y: opening.y - o, width: opening.width + 2 * o, height: top - (opening.y - o) };
}

/** Film area, mm² (the film is a separate material: it does not change the paper weight). */
export function getWindowFilmArea(window: BagWindow, dimensions: WindowDimensions): number {
  const film = getWindowFilm(window, dimensions);
  return film.width * film.height;
}

/** Area of the opening cut from the paper, mm². */
export function getWindowOpeningArea(window: BagWindow, dimensions: WindowDimensions): number {
  const opening = getWindowOpening(window, dimensions);
  return opening.width * opening.height;
}

/** True when the FRONT panel-local point lies in the opening (half-open on the right / top edge). */
export function isInWindowOpening(opening: WindowRect, x: number, y: number): boolean {
  return x >= opening.x && x < opening.x + opening.width && y >= opening.y && y < opening.y + opening.height;
}

/**
 * The window with every value brought into its limits for `dimensions` (whole mm; overlap first, then width, height,
 * bottom offset). Non-finite values fall back to the defaults. Unknown materials become the default material.
 */
export function constrainWindow(window: BagWindow, dimensions: WindowDimensions): BagWindow {
  const rules = WINDOW_RULES;
  const material: WindowMaterial = rules.materials.includes(window.material) ? window.material : rules.materials[0];
  const overlap = Number.isFinite(window.filmOverlap)
    ? clamp(Math.round(window.filmOverlap), rules.filmOverlap.min, rules.filmOverlap.max)
    : rules.filmOverlap.default;
  const defaults = getDefaultWindowSize(window.type, dimensions, overlap);
  const fit = (value: number, range: Range, fallback: number) => {
    const v = Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(0, clamp(v, range.min, Math.max(range.min, range.max)));
  };
  const base = { ...window, material, filmOverlap: overlap };
  const limits = getWindowLimits(base, dimensions);
  const width = fit(window.width, limits.width, defaults.width);
  if (window.type === 'PANORAMIC') {
    const start = limits.bottomOffset;
    const bottomOffset = fit(window.bottomOffset ?? start.min, start, start.min);
    return { type: 'PANORAMIC', material, width, bottomOffset, filmOverlap: overlap };
  }
  const height = fit(window.height, limits.height, defaults.height);
  const bottomLimits = getWindowLimits({ ...base, type: 'RECTANGLE', width, height, bottomOffset: 0 }, dimensions).bottomOffset;
  const bottomOffset = fit(window.bottomOffset, bottomLimits, defaults.bottomOffset);
  return { type: 'RECTANGLE', material, width, height, bottomOffset, filmOverlap: overlap };
}

/** Default size of a new window of `type` [Z] (before clamping): shares of the room left by the margins, 5 mm steps. */
function getDefaultWindowSize(type: WindowType, dimensions: WindowDimensions, filmOverlap: number) {
  const { defaults } = WINDOW_RULES;
  const m = getWindowMargin(filmOverlap);
  const d = getBottomFoldDepth(dimensions);
  const roomX = dimensions.width - 2 * m;
  const roomY = dimensions.height - d - 2 * m;
  const width = roundTo(roomX * (type === 'PANORAMIC' ? defaults.panoramicWidthRatio : defaults.rectangleWidthRatio), 5);
  const height = roundTo(roomY * defaults.rectangleHeightRatio, 5);
  // Rectangle centred vertically in the room above the bottom strip.
  const bottomOffset = roundTo(d + m + (roomY - height) / 2, 5);
  return { width, height, bottomOffset };
}

/**
 * A new window of `type` for a bag of `dimensions`. Material, film overlap and width are carried over from `previous`
 * (switching panoramic ↔ rectangle); the rest starts from the defaults [Z]. Always valid (`constrainWindow`).
 */
export function createWindow(type: WindowType, dimensions: WindowDimensions, previous: BagWindow | null = null): BagWindow {
  const filmOverlap = previous?.filmOverlap ?? WINDOW_RULES.filmOverlap.default;
  const material = previous?.material ?? WINDOW_RULES.materials[0];
  const size = getDefaultWindowSize(type, dimensions, filmOverlap);
  const width = previous?.width ?? size.width;
  const window: BagWindow =
    type === 'PANORAMIC'
      ? { type, material, width, filmOverlap }
      : { type, material, width, height: size.height, bottomOffset: size.bottomOffset, filmOverlap };
  return constrainWindow(window, dimensions);
}

/** Error of one field value (a draft in the UI) against the limits of the window as it is, or null when valid. */
export function validateWindowValue(
  field: WindowField,
  value: number,
  window: BagWindow,
  dimensions: WindowDimensions,
): WindowValueError | null {
  if (!Number.isFinite(value)) return 'NOT_A_NUMBER';
  if (!Number.isInteger(value)) return 'NOT_INTEGER';
  const probe = field === 'filmOverlap' || field === 'width' ? window : ({ ...window, [field]: value } as BagWindow);
  const range = getWindowLimits(probe, dimensions)[field];
  if (value < range.min) return 'BELOW_MIN';
  if (value > range.max) return 'ABOVE_MAX';
  return null;
}

/** Every field of a stored window that is out of its limits (empty = valid). */
export function validateWindow(window: BagWindow, dimensions: WindowDimensions): WindowError[] {
  const fields: WindowField[] =
    window.type === 'PANORAMIC' ? ['filmOverlap', 'width', 'bottomOffset'] : ['filmOverlap', 'width', 'height', 'bottomOffset'];
  const limits = getWindowLimits(window, dimensions);
  const errors: WindowError[] = [];
  for (const field of fields) {
    const value = (window as Record<WindowField, number>)[field];
    const code = validateWindowValue(field, value, window, dimensions);
    if (code) errors.push({ field, code, min: limits[field].min, max: limits[field].max });
  }
  return errors;
}

/** Soft warnings: an opening larger than `WINDOW_RULES.largeOpeningShare` of FRONT's print area W × (H − d). */
export function getWindowWarnings(window: BagWindow, dimensions: WindowDimensions): WindowWarning[] {
  const printArea = dimensions.width * (dimensions.height - getBottomFoldDepth(dimensions));
  return printArea > 0 && getWindowOpeningArea(window, dimensions) > WINDOW_RULES.largeOpeningShare * printArea
    ? ['WINDOW_LARGE_OPENING']
    : [];
}
