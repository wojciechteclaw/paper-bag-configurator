// Finding artwork inside a configuration without knowing where artwork slots live. Pure TS.
//
// Project files serialize the configuration object as-is (new fields flow through untouched), so artwork is located
// structurally: any plain object shaped like an `Artwork` (walls, whole-bag layers, a legacy `wrapArtwork`, or slots
// added later) is an artwork reference.

import type { Artwork } from '../types';

type Json = unknown;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for objects shaped like an `Artwork` (id, file name, URL, MIME type and pixel size). */
export function isArtworkLike(value: unknown): value is Artwork {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.fileUrl === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

/** Every artwork reference in `value`, depth-first in key order (duplicates included). */
export function collectArtworks(value: Json): Artwork[] {
  const found: Artwork[] = [];
  const visit = (node: Json) => {
    if (isArtworkLike(node)) {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) node.forEach(visit);
    else if (isPlainObject(node)) Object.values(node).forEach(visit);
  };
  visit(value);
  return found;
}

/**
 * Deep copy of `value` (plain objects and arrays) with every artwork reference replaced by `replace(artwork)`;
 * returning `null` from `replace` empties that slot. Other values are copied as they are.
 */
export function mapArtworks<T>(value: T, replace: (artwork: Artwork) => Artwork | null): T {
  const visit = (node: Json): Json => {
    if (isArtworkLike(node)) return replace(node);
    if (Array.isArray(node)) return node.map(visit);
    if (isPlainObject(node)) return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
    return node;
  };
  return visit(value) as T;
}
