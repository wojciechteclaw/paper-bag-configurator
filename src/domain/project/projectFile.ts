// Project file format (docs/SPEC.md §4h): the whole configurator state that belongs to the product — the
// `BagConfiguration` plus every artwork file it references — in one portable file. Pure TS (fflate is a plain
// JS ZIP codec, already used by jsPDF).
//
// File: a ZIP archive, extension `.bagproj`.
//
//   project.json          manifest (JSON, deflated)
//   artwork/1.png         artwork files, stored as they were uploaded (no recompression), one per artwork id
//   artwork/2.webp …
//
// Manifest:
//   format          "paper-bag-configurator/project"
//   formatVersion   integer, PROJECT_FORMAT_VERSION; newer versions are rejected, older ones migrated
//   generator       { name, version } of the app that wrote the file (informational)
//   exportedAt      ISO 8601 timestamp
//   configuration   the BagConfiguration AS-IS (unknown / future fields included), except that every artwork's
//                   `fileUrl` is the archive path of its file (object URLs are not portable)
//   files           [{ artworkId, path, fileName, mimeType, width, height, sizeBytes }] — one per distinct artwork id
//   view            optional (added within v1): { step, previewMode, timelineProgress, selectedArtwork } — where the
//                   user was (`viewState.ts`); missing = the default view
//
// Reading also accepts the older plain JSON download of the configuration (`bag-configuration-<id>.json`) and a bare
// manifest: their artwork cannot be restored (it was only a `blob:` URL of the tab that saved it) and is dropped with
// a warning.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ARTWORK_RULES, PROJECT_FILE_RULES } from '../config/productCatalog';
import { getDimensionsSlug } from '../dimensionNotation';
import type { Artwork, BagConfiguration } from '../types';
import { collectArtworks, mapArtworks } from './artworkRefs';
import { sanitizeConfiguration, type ConfigurationAdjustment } from './sanitizeConfiguration';
import type { ProjectViewState } from './viewState';

export const PROJECT_FORMAT = 'paper-bag-configurator/project';
/** Version of the file layout and manifest. Bump it (and add a migration) when either changes incompatibly. */
export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_MANIFEST_PATH = 'project.json';
export const PROJECT_GENERATOR_NAME = 'paper-bag-configurator';

export type ProjectFileEntry = {
  artworkId: string;
  /** Path of the file inside the archive. */
  path: string;
  fileName: string;
  mimeType: string;
  /** Pixel size. */
  width: number;
  height: number;
  sizeBytes: number;
};

export type ProjectManifest = {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  generator: { name: string; version: string };
  exportedAt: string;
  configuration: BagConfiguration;
  files: ProjectFileEntry[];
  /** Optional view state (`viewState.ts`); older files have none. */
  view?: ProjectViewState;
};

export type ProjectFileErrorCode =
  /** The file is empty. */
  | 'EMPTY_FILE'
  /** Over `PROJECT_FILE_RULES` (file, manifest, uncompressed total) or an artwork over `ARTWORK_RULES.maxSizeBytes`. */
  | 'TOO_LARGE'
  /** More artwork files than `PROJECT_FILE_RULES.maxFiles`. */
  | 'TOO_MANY_FILES'
  /** Neither a project archive nor a configuration JSON of this app. */
  | 'NOT_A_PROJECT'
  /** Written by a newer version of the app (`detail`: the file's format version). */
  | 'NEWER_VERSION'
  /** An artwork referenced by the configuration has no file (`detail`: its file name). */
  | 'MISSING_FILE'
  /** Damaged archive, invalid JSON / manifest, or a file that is not the declared image (`detail`: the file name). */
  | 'CORRUPT_DATA'
  /** The bag type of the project is not available in this version (`detail`: the type). */
  | 'UNSUPPORTED_PRODUCT_TYPE';

export class ProjectFileError extends Error {
  readonly code: ProjectFileErrorCode;
  readonly detail?: string;

  constructor(code: ProjectFileErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProjectFileError';
    this.code = code;
    this.detail = detail;
  }
}

export const isProjectFileError = (error: unknown): error is ProjectFileError => error instanceof ProjectFileError;

/** Non-fatal findings of a load. */
export type ProjectWarning =
  /** The file is the older plain configuration JSON (no project archive). */
  | 'LEGACY_CONFIGURATION'
  /** The file referenced artwork but carried no image data, so the artwork was dropped. */
  | 'ARTWORK_NOT_INCLUDED';

/** One artwork file of a loaded project. */
export type ProjectArtworkFile = { bytes: Uint8Array; mimeType: string };

export type ParsedProject = {
  /** Valid configuration; artwork `fileUrl`s are archive paths — replace them with URLs of `files` before use. */
  configuration: BagConfiguration;
  /** Artwork file per artwork id (every artwork of `configuration` has one). */
  files: Map<string, ProjectArtworkFile>;
  /** Format version of the file; null for the older plain configuration JSON. */
  formatVersion: number | null;
  exportedAt: Date | null;
  generator: { name: string; version: string } | null;
  /** Values that were clamped / replaced / dropped to fit the current catalog. */
  adjustments: ConfigurationAdjustment[];
  warnings: ProjectWarning[];
  /** The stored `view` section as found (unvalidated — read it through `sanitizeProjectView`); null when absent. */
  view: Record<string, unknown> | null;
};

// ——— Helpers ———

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);

/** Image type recognised from the file's first bytes (PNG / JPEG / WEBP), or null. */
export function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * Suggested file name: `<prefix>-<type>-<size>-<YYYY-MM-DD>.bagproj`, e.g.
 * `projekt-torby-block-200x400x150-2026-09-30.bagproj` or, for the gusseted bag (W + F × H),
 * `projekt-torby-folded-140+90x370-2026-09-30.bagproj` (local date; the prefix is localised by the UI).
 */
export function getProjectFileName(configuration: Pick<BagConfiguration, 'productType' | 'dimensions'>, date: Date, prefix: string): string {
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const safePrefix = prefix.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'project';
  return `${safePrefix}-${configuration.productType.toLowerCase()}-${getDimensionsSlug(configuration)}-${day}${PROJECT_FILE_RULES.extension}`;
}

/** Distinct artworks of a configuration (first occurrence per artwork id), in configuration order. */
export function getProjectArtworks(configuration: BagConfiguration): Artwork[] {
  const byId = new Map<string, Artwork>();
  collectArtworks(configuration).forEach((artwork) => {
    if (!byId.has(artwork.id)) byId.set(artwork.id, artwork);
  });
  return [...byId.values()];
}

// ——— Writing ———

export type SerializeProjectInput = {
  configuration: BagConfiguration;
  /** File contents per artwork id; every artwork of the configuration needs one. */
  files: ReadonlyMap<string, Uint8Array>;
  exportedAt: Date;
  appVersion: string;
  /** View state to store with the project (optional). */
  view?: ProjectViewState;
};

/** The manifest of a project (configuration with archive paths instead of object URLs) and the archive entries. */
export function buildProjectManifest({ configuration, files, exportedAt, appVersion, view }: SerializeProjectInput): {
  manifest: ProjectManifest;
  entries: Map<string, Uint8Array>;
} {
  const artworks = getProjectArtworks(configuration);
  if (artworks.length > PROJECT_FILE_RULES.maxFiles) throw new ProjectFileError('TOO_MANY_FILES', String(artworks.length));
  const entries = new Map<string, Uint8Array>();
  const pathById = new Map<string, string>();
  const fileEntries: ProjectFileEntry[] = [];
  let total = 0;
  artworks.forEach((artwork, index) => {
    const bytes = files.get(artwork.id);
    if (!bytes || bytes.length === 0) throw new ProjectFileError('MISSING_FILE', artwork.fileName);
    total += bytes.length;
    const path = `artwork/${index + 1}.${EXTENSIONS[artwork.mimeType] ?? 'bin'}`;
    pathById.set(artwork.id, path);
    entries.set(path, bytes);
    fileEntries.push({
      artworkId: artwork.id,
      path,
      fileName: artwork.fileName,
      mimeType: artwork.mimeType,
      width: artwork.width,
      height: artwork.height,
      sizeBytes: bytes.length,
    });
  });
  if (total > PROJECT_FILE_RULES.maxUncompressedBytes) throw new ProjectFileError('TOO_LARGE');
  const manifest: ProjectManifest = {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    generator: { name: PROJECT_GENERATOR_NAME, version: appVersion },
    exportedAt: exportedAt.toISOString(),
    configuration: mapArtworks(configuration, (artwork) => ({ ...artwork, fileUrl: pathById.get(artwork.id) ?? '' })),
    files: fileEntries,
    ...(view ? { view: { ...view } } : {}),
  };
  return { manifest, entries };
}

/** The project archive (`.bagproj`). Throws `ProjectFileError` (MISSING_FILE, TOO_LARGE, TOO_MANY_FILES). */
export function serializeProject(input: SerializeProjectInput): Uint8Array {
  const { manifest, entries } = buildProjectManifest(input);
  const mtime = input.exportedAt;
  const zippable: Zippable = {
    [PROJECT_MANIFEST_PATH]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime }],
  };
  // Images are already compressed: store them as they are.
  entries.forEach((bytes, path) => {
    zippable[path] = [bytes, { level: 0, mtime }];
  });
  return zipSync(zippable);
}

// ——— Reading ———

/**
 * Migrations of older manifests to the current `PROJECT_FORMAT_VERSION`, keyed by the version they upgrade FROM.
 * Version 1 is the first one; configuration-shape changes inside the configuration (e.g. the single `wrapArtwork`
 * → `wrapLayers`) are handled by `sanitizeConfiguration` whatever the format version.
 */
const MANIFEST_MIGRATIONS: Readonly<Record<number, (manifest: Record<string, unknown>) => Record<string, unknown>>> = {};

function migrateManifest(manifest: Record<string, unknown>): Record<string, unknown> {
  const version = manifest.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFileError('CORRUPT_DATA', PROJECT_MANIFEST_PATH);
  }
  if (version > PROJECT_FORMAT_VERSION) throw new ProjectFileError('NEWER_VERSION', String(version));
  let current = manifest;
  for (let v = version; v < PROJECT_FORMAT_VERSION; v += 1) {
    const migrate = MANIFEST_MIGRATIONS[v];
    if (!migrate) throw new ProjectFileError('CORRUPT_DATA', PROJECT_MANIFEST_PATH);
    current = { ...migrate(current), formatVersion: v + 1 };
  }
  return current;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProjectFileError('CORRUPT_DATA', what);
  }
}

function sanitizeOrThrow(raw: unknown) {
  const result = sanitizeConfiguration(raw);
  if (!result.ok) {
    throw new ProjectFileError(result.error === 'UNSUPPORTED_PRODUCT_TYPE' ? 'UNSUPPORTED_PRODUCT_TYPE' : 'CORRUPT_DATA', result.detail);
  }
  return result;
}

/** A configuration JSON without files (older download, or a bare manifest): artwork dropped with a warning. */
function parseJsonWithoutFiles(value: unknown): ParsedProject {
  const isManifest = isRecord(value) && value.format === PROJECT_FORMAT;
  if (isManifest) migrateManifest(value);
  const raw = isManifest ? value.configuration : value;
  if (!isRecord(raw) || !isRecord(raw.dimensions) || !isRecord(raw.panels)) throw new ProjectFileError('NOT_A_PROJECT');
  const hadArtwork = collectArtworks(raw).length > 0;
  const { configuration, adjustments } = sanitizeOrThrow(mapArtworks(raw, () => null));
  const warnings: ProjectWarning[] = [];
  if (!isManifest) warnings.push('LEGACY_CONFIGURATION');
  if (hadArtwork) warnings.push('ARTWORK_NOT_INCLUDED');
  return {
    configuration,
    files: new Map(),
    formatVersion: isManifest ? PROJECT_FORMAT_VERSION : null,
    exportedAt: isManifest ? parseDate(value.exportedAt) : null,
    generator: isManifest ? parseGenerator(value.generator) : null,
    adjustments,
    warnings,
    view: isManifest && isRecord(value.view) ? value.view : null,
  };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGenerator(value: unknown): { name: string; version: string } | null {
  return isRecord(value) && typeof value.name === 'string' && typeof value.version === 'string'
    ? { name: value.name, version: value.version }
    : null;
}

function unzipProject(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  let files = 0;
  let tooLarge = false;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      // Called with the sizes from the archive directory BEFORE anything is inflated.
      filter: (file) => {
        if (file.name.endsWith('/')) return false;
        total += file.originalSize;
        if (file.name === PROJECT_MANIFEST_PATH) {
          if (file.originalSize > PROJECT_FILE_RULES.maxManifestBytes) tooLarge = true;
        } else {
          files += 1;
          if (file.originalSize > ARTWORK_RULES.maxSizeBytes) tooLarge = true;
        }
        const accept = !tooLarge && total <= PROJECT_FILE_RULES.maxUncompressedBytes && files <= PROJECT_FILE_RULES.maxFiles;
        return accept;
      },
    });
  } catch {
    throw new ProjectFileError('CORRUPT_DATA');
  }
  if (tooLarge || total > PROJECT_FILE_RULES.maxUncompressedBytes) throw new ProjectFileError('TOO_LARGE');
  if (files > PROJECT_FILE_RULES.maxFiles) throw new ProjectFileError('TOO_MANY_FILES', String(files));
  return unzipped;
}

function parseArchive(bytes: Uint8Array): ParsedProject {
  const archive = unzipProject(bytes);
  const manifestBytes = archive[PROJECT_MANIFEST_PATH];
  if (!manifestBytes) throw new ProjectFileError('NOT_A_PROJECT');
  const value = parseJson(strFromU8(manifestBytes), PROJECT_MANIFEST_PATH);
  if (!isRecord(value) || value.format !== PROJECT_FORMAT) throw new ProjectFileError('NOT_A_PROJECT');
  const manifest = migrateManifest(value);
  if (!isRecord(manifest.configuration) || !Array.isArray(manifest.files)) {
    throw new ProjectFileError('CORRUPT_DATA', PROJECT_MANIFEST_PATH);
  }

  const files = new Map<string, ProjectArtworkFile>();
  manifest.files.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.artworkId !== 'string' || typeof entry.path !== 'string') {
      throw new ProjectFileError('CORRUPT_DATA', PROJECT_MANIFEST_PATH);
    }
    const fileName = typeof entry.fileName === 'string' ? entry.fileName : entry.path;
    const data = Object.hasOwn(archive, entry.path) ? archive[entry.path] : undefined;
    if (!data) throw new ProjectFileError('MISSING_FILE', fileName);
    const sniffed = sniffImageMimeType(data);
    if (!sniffed) throw new ProjectFileError('CORRUPT_DATA', fileName);
    files.set(entry.artworkId, { bytes: data, mimeType: sniffed });
  });

  // Every artwork must have its file; the stored MIME type follows the actual image data.
  const configurationWithFiles = mapArtworks(manifest.configuration, (artwork) => {
    const file = files.get(artwork.id);
    if (!file) throw new ProjectFileError('MISSING_FILE', artwork.fileName);
    return artwork.mimeType === file.mimeType ? artwork : { ...artwork, mimeType: file.mimeType };
  });
  const { configuration, adjustments } = sanitizeOrThrow(configurationWithFiles);
  // Artwork dropped by the sanitiser (e.g. an unusable pixel size) no longer needs its file.
  const used = new Set(getProjectArtworks(configuration).map((artwork) => artwork.id));
  [...files.keys()].forEach((id) => {
    if (!used.has(id)) files.delete(id);
  });
  return {
    configuration,
    files,
    formatVersion: PROJECT_FORMAT_VERSION,
    exportedAt: parseDate(manifest.exportedAt),
    generator: parseGenerator(manifest.generator),
    adjustments,
    warnings: [],
    view: isRecord(manifest.view) ? manifest.view : null,
  };
}

/**
 * Reads a project file (or the older configuration JSON). Throws `ProjectFileError` with a typed code; never returns
 * a partially valid project — the configuration is sanitised to the current catalog (see `ParsedProject.adjustments`).
 */
export function parseProject(bytes: Uint8Array): ParsedProject {
  if (bytes.length === 0) throw new ProjectFileError('EMPTY_FILE');
  if (bytes.length > PROJECT_FILE_RULES.maxFileSizeBytes) throw new ProjectFileError('TOO_LARGE');
  if (startsWith(bytes, ZIP_SIGNATURE)) return parseArchive(bytes);
  // Plain JSON (optionally with a UTF-8 BOM / leading whitespace).
  const head = strFromU8(bytes.subarray(0, Math.min(bytes.length, 64)), true).replace(/^\xEF\xBB\xBF/, '').trimStart();
  if (!head.startsWith('{')) throw new ProjectFileError('NOT_A_PROJECT');
  if (bytes.length > PROJECT_FILE_RULES.maxManifestBytes) throw new ProjectFileError('TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(bytes).replace(/^﻿/, ''));
  } catch {
    throw new ProjectFileError('NOT_A_PROJECT');
  }
  return parseJsonWithoutFiles(value);
}
