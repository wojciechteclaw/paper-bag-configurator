// Turns a configuration read from a file (project, older JSON download) into a valid `BagConfiguration` of the
// current catalog. Pure TS.
//
// Known fields are checked with the same factories and constraints the store actions use: out-of-range values are
// clamped, unavailable options fall back to the defaults, unusable entries are dropped — every such change is reported
// as an adjustment so the UI can tell the user. Older shapes are migrated (a single `wrapArtwork` → `wrapLayers`,
// missing `artworkLayout` / `colorAnalysis` / `extendToBottom`). Unknown fields — at the top level and inside known
// objects — are kept as they are, so fields added by newer code (or by other features) flow through a save / load.

import { getArtworkLayout, getWrapArtworkArea, getWrapLayers } from '../artworkLayout';
import { getPanelArtworkArea, normalizePlacement, DEFAULT_PLACEMENT, type Size2 } from '../artworkPlacement';
import { ARTWORK_RULES, BAG_TYPES, MAX_WRAP_ARTWORK_LAYERS, type BagTypeDefinition } from '../config/productCatalog';
import { constrainDimensions } from '../constraints';
import { createConfiguration, createHandle, createPanel, PANEL_POSITIONS } from '../factories';
import { constrainGlueFlapWidth } from '../glueFlap';
import { constrainPaperToVariant, getHandleVariantDefinition, getSupportedHandleTypes } from '../handleVariants';
import { suggestPantonePreviewHex } from '../printColors';
import { normalizeHex } from '../printCoverage/color';
import { normalizeColorAnalysis } from '../printCoverage/colorAnalysis';
import type {
  Artwork,
  ArtworkPlacement,
  BagConfiguration,
  BagPanel,
  BagPanels,
  BagType,
  Dimensions,
  Handle,
  HandleType,
  PantoneColor,
  Paper,
  PrintSpec,
  WrapArtworkLayer,
} from '../types';
import { normalizePantoneCode, validatePantoneColorToAdd } from '../validation/production';
import { isArtworkLike } from './artworkRefs';

/** Part of the configuration an adjustment belongs to (the UI names the section). */
export type AdjustmentSection = 'dimensions' | 'paper' | 'handle' | 'artwork' | 'print' | 'packaging';

/** A value from the file that could not be used as it was (clamped, replaced by a default, or dropped). */
export type ConfigurationAdjustment = { section: AdjustmentSection; field: string };

export type SanitizeError = 'NOT_A_CONFIGURATION' | 'UNSUPPORTED_PRODUCT_TYPE';

export type SanitizeResult =
  | { ok: true; configuration: BagConfiguration; adjustments: ConfigurationAdjustment[] }
  | { ok: false; error: SanitizeError; detail?: string };

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const asRecord = (value: unknown): Raw => (isRecord(value) ? value : {});
const numberOrNaN = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isPositiveFinite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
/** Every field of `expected` has the same value in `actual` (key order and extra fields of `actual` ignored). */
const sameFields = (expected: object, actual: unknown) =>
  isRecord(actual) && Object.entries(expected).every(([key, value]) => value === actual[key]);

/** True for an artwork the app can show: positive pixel size, an accepted image type and a file reference. */
export function isUsableArtwork(value: unknown): value is Artwork {
  return (
    isArtworkLike(value) &&
    value.fileUrl !== '' &&
    isPositiveFinite(value.width) &&
    isPositiveFinite(value.height) &&
    ARTWORK_RULES.acceptedMimeTypes.includes(value.mimeType)
  );
}

function sanitizeArtwork(artwork: Artwork): Artwork {
  const sizeBytes = typeof artwork.sizeBytes === 'number' && Number.isFinite(artwork.sizeBytes) && artwork.sizeBytes >= 0
    ? artwork.sizeBytes
    : 0;
  return { ...artwork, sizeBytes };
}

/** A placement valid for `area` (mode, offsets / scale / rotation limits); unusable input → the default placement. */
function sanitizePlacement(raw: unknown, areaOf: (placement: Pick<ArtworkPlacement, 'extendToBottom'>) => Size2) {
  if (!isRecord(raw) || (raw.mode !== 'FILL' && raw.mode !== 'CUSTOM')) {
    return { placement: { ...DEFAULT_PLACEMENT }, changed: raw !== undefined };
  }
  const input = raw as unknown as ArtworkPlacement;
  const normalized = normalizePlacement(input, areaOf({ extendToBottom: input.extendToBottom === true }));
  // A missing `extendToBottom` is older data (read as false), not an error.
  const expected = raw.extendToBottom === undefined ? { ...raw, extendToBottom: false } : raw;
  return { placement: normalized, changed: !sameFields(normalized, expected) };
}

function sanitizeDimensions(raw: unknown, definition: BagTypeDefinition, defaults: Dimensions, note: (field: string) => void) {
  const stored = asRecord(raw);
  const requested: Dimensions = {
    width: numberOrNaN(stored.width),
    height: numberOrNaN(stored.height),
    depth: numberOrNaN(stored.depth),
  };
  const dimensions = constrainDimensions(requested, defaults, definition.limits);
  (Object.keys(dimensions) as (keyof Dimensions)[]).forEach((key) => {
    if (dimensions[key] !== requested[key]) note(key);
  });
  return { ...stored, ...dimensions } as Dimensions;
}

function sanitizeHandle(raw: unknown, definition: BagTypeDefinition, note: (field: string) => void): Handle | null {
  if (raw === null || raw === undefined) return null;
  const stored = asRecord(raw);
  const type = stored.type as HandleType;
  if (!getSupportedHandleTypes(definition).includes(type)) {
    note('type');
    return null;
  }
  const defaults = createHandle(type);
  const handle: Raw = { ...defaults, ...stored };
  if (!isNonEmptyString(stored.id)) handle.id = defaults.id;
  if (stored.material !== defaults.material) {
    if (stored.material !== undefined) note('material');
    handle.material = defaults.material;
  }
  for (const key of ['width', 'length'] as const) {
    if (stored[key] !== undefined && !isPositiveFinite(stored[key])) {
      note(key);
      handle[key] = defaults[key];
    }
  }
  if (stored.color !== undefined && typeof stored.color !== 'string') {
    note('color');
    handle.color = defaults.color;
  }
  if (stored.patch !== undefined) {
    const patch = asRecord(stored.patch);
    if (!isPositiveFinite(patch.width) || !isPositiveFinite(patch.height)) {
      note('patch');
      if (defaults.patch) handle.patch = { ...defaults.patch };
      else delete handle.patch;
    }
  }
  return handle as Handle;
}

function sanitizePaper(raw: unknown, definition: BagTypeDefinition, handle: Handle | null, defaults: Paper, note: (field: string) => void): Paper {
  const stored = asRecord(raw);
  const paper: Paper = {
    ...(stored as Partial<Paper>),
    type: stored.type as Paper['type'],
    color: stored.color as Paper['color'],
    grammage: numberOrNaN(stored.grammage),
    fscCertified: stored.fscCertified === true,
    moistureBarrier: stored.moistureBarrier === true,
  };
  if (!definition.paperColors.includes(paper.color)) {
    note('color');
    paper.color = defaults.color;
  }
  if (!Number.isFinite(paper.grammage)) {
    note('grammage');
    paper.grammage = defaults.grammage;
  }
  if (typeof stored.fscCertified !== 'boolean') note('fscCertified');
  if (stored.moistureBarrier !== undefined && typeof stored.moistureBarrier !== 'boolean') note('moistureBarrier');
  const { paper: constrained, adjustments } = constrainPaperToVariant(paper, getHandleVariantDefinition(definition, handle));
  adjustments.forEach(({ field }) => note(field));
  return constrained;
}

function sanitizePanels(raw: unknown, dimensions: Dimensions, note: (field: string) => void): BagPanels {
  const stored = asRecord(raw);
  const entries = PANEL_POSITIONS.map((position): [string, BagPanel] => {
    const source = stored[position];
    if (!isRecord(source)) {
      if (source !== undefined) note(`panels.${position}`);
      return [position, createPanel(position)];
    }
    let artwork: Artwork | null = null;
    if (isUsableArtwork(source.artwork)) artwork = sanitizeArtwork(source.artwork);
    else if (source.artwork !== null && source.artwork !== undefined) note(`panels.${position}.artwork`);
    const { placement, changed } = sanitizePlacement(source.placement, (p) => getPanelArtworkArea(position, dimensions, p));
    if (changed) note(`panels.${position}.placement`);
    const panel = {
      ...source,
      id: isNonEmptyString(source.id) ? source.id : createPanel(position).id,
      position,
      artwork,
      placement,
    } as BagPanel;
    return [position, panel];
  });
  return Object.fromEntries(entries) as BagPanels;
}

function sanitizeWrapLayers(raw: Raw, dimensions: Dimensions, note: (field: string) => void): WrapArtworkLayer[] {
  const source = Array.isArray(raw.wrapLayers) ? (raw.wrapLayers as unknown[]) : getWrapLayers(raw as never);
  const ids = new Set<string>();
  const layers: WrapArtworkLayer[] = [];
  source.forEach((entry, index) => {
    const layer = asRecord(entry);
    if (!isUsableArtwork(layer.artwork)) {
      note(`wrapLayers.${index}.artwork`);
      return;
    }
    let id = isNonEmptyString(layer.id) ? layer.id : '';
    if (!id || ids.has(id)) {
      if (id) note(`wrapLayers.${index}.id`);
      id = `layer-${index + 1}-${layer.artwork.id}`;
      while (ids.has(id)) id = `${id}-${index}`;
    }
    ids.add(id);
    const { placement, changed } = sanitizePlacement(layer.placement, (p) => getWrapArtworkArea(dimensions, p));
    if (changed) note(`wrapLayers.${index}.placement`);
    layers.push({ ...layer, id, artwork: sanitizeArtwork(layer.artwork), placement } as WrapArtworkLayer);
  });
  if (layers.length > MAX_WRAP_ARTWORK_LAYERS) note('wrapLayers');
  return layers.slice(0, MAX_WRAP_ARTWORK_LAYERS);
}

function sanitizePrint(raw: unknown, definition: BagTypeDefinition, note: (field: string) => void): PrintSpec {
  const stored = asRecord(raw);
  const technology = definition.print.technologies.includes(stored.technology as PrintSpec['technology'])
    ? (stored.technology as PrintSpec['technology'])
    : definition.print.technologies[0];
  if (technology !== stored.technology) note('technology');
  const pantoneColors: PantoneColor[] = [];
  (Array.isArray(stored.pantoneColors) ? stored.pantoneColors : []).forEach((entry, index) => {
    const color = asRecord(entry);
    const code = typeof color.code === 'string' ? color.code : '';
    if (validatePantoneColorToAdd(pantoneColors, code, definition.print.maxColors) !== null) {
      note(`pantoneColors.${index}`);
      return;
    }
    const normalizedCode = normalizePantoneCode(code);
    let hex = typeof color.hex === 'string' ? normalizeHex(color.hex) : null;
    if (hex === null || hex !== color.hex) note(`pantoneColors.${index}.hex`);
    hex ??= suggestPantonePreviewHex(normalizedCode, pantoneColors.map((c) => c.hex));
    if (normalizedCode !== code) note(`pantoneColors.${index}.code`);
    pantoneColors.push({ ...color, code: normalizedCode, hex });
  });
  if (stored.pantoneColors !== undefined && !Array.isArray(stored.pantoneColors)) note('pantoneColors');
  const colorAnalysis = normalizeColorAnalysis(asRecord(stored.colorAnalysis));
  if (stored.colorAnalysis !== undefined && !sameFields(colorAnalysis, stored.colorAnalysis)) note('colorAnalysis');
  return { ...stored, technology, pantoneColors, colorAnalysis };
}

/**
 * A valid configuration of the current catalog from anything read from a file, with what had to be changed. Fails
 * only when the input is not a configuration at all, or its product type is unknown / not available in this build.
 */
export function sanitizeConfiguration(raw: unknown): SanitizeResult {
  if (!isRecord(raw) || !isRecord(raw.dimensions)) return { ok: false, error: 'NOT_A_CONFIGURATION' };
  const productType = (raw.productType ?? 'BLOCK') as BagType;
  const definition = typeof productType === 'string' && Object.hasOwn(BAG_TYPES, productType) ? BAG_TYPES[productType] : undefined;
  if (!definition?.available) return { ok: false, error: 'UNSUPPORTED_PRODUCT_TYPE', detail: String(productType) };

  const defaults = createConfiguration(productType);
  const adjustments: ConfigurationAdjustment[] = [];
  const noter = (section: ConfigurationAdjustment['section']) => (field: string) => adjustments.push({ section, field });

  const dimensions = sanitizeDimensions(raw.dimensions, definition, defaults.dimensions, noter('dimensions'));
  const handle = sanitizeHandle(raw.handle, definition, noter('handle'));
  const paper = sanitizePaper(raw.paper, definition, handle, defaults.paper, noter('paper'));
  const panels = sanitizePanels(raw.panels, dimensions, noter('artwork'));
  if (raw.artworkLayout !== undefined && getArtworkLayout(raw) !== raw.artworkLayout) noter('artwork')('artworkLayout');
  const wrapLayers = sanitizeWrapLayers(raw, dimensions, noter('artwork'));
  const print = sanitizePrint(raw.print, definition, noter('print'));
  const packaging = definition.packaging.includes(raw.packaging as BagConfiguration['packaging'])
    ? (raw.packaging as BagConfiguration['packaging'])
    : defaults.packaging;
  if (packaging !== raw.packaging) noter('packaging')('packaging');
  const glueFlapWidth =
    raw.glueFlapWidth === undefined
      ? defaults.glueFlapWidth
      : constrainGlueFlapWidth(Number(raw.glueFlapWidth), productType, defaults.glueFlapWidth);
  if (raw.glueFlapWidth !== undefined && glueFlapWidth !== raw.glueFlapWidth) noter('dimensions')('glueFlapWidth');

  const { wrapArtwork: _legacy, ...rest } = raw;
  const configuration = {
    ...rest,
    id: isNonEmptyString(raw.id) ? raw.id : defaults.id,
    productType,
    dimensions,
    paper,
    handle,
    panels,
    artworkLayout: getArtworkLayout(raw),
    wrapLayers,
    print,
    packaging,
    glueFlapWidth,
  } as BagConfiguration;
  return { ok: true, configuration, adjustments };
}
