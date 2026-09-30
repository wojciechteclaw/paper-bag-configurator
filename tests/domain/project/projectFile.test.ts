import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { legacyWrapLayerId } from '../../../src/domain/artworkLayout';
import { PROJECT_FILE_RULES } from '../../../src/domain/config/productCatalog';
import { createConfiguration, createHandle, createWrapLayer } from '../../../src/domain/factories';
import {
  getProjectArtworks,
  getProjectFileName,
  mapArtworks,
  parseProject,
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  PROJECT_MANIFEST_PATH,
  ProjectFileError,
  serializeProject,
  sniffImageMimeType,
  type ProjectFileErrorCode,
} from '../../../src/domain/project/index';
import { fixtureArtwork, fixtureProject, JPEG_BYTES, PNG_BYTES, WEBP_BYTES, withoutFileUrls } from './testFixtures';

const EXPORTED_AT = new Date('2026-09-30T10:20:30.000Z');

function exportFixture() {
  const { configuration, files } = fixtureProject();
  const bytes = serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: '1.2.3' });
  return { configuration, files, bytes };
}

/** Re-packs an archive after changing its entries (manifest as an object). */
function repack(bytes: Uint8Array, change: (entries: Record<string, Uint8Array>, manifest: Record<string, unknown>) => void) {
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(entries[PROJECT_MANIFEST_PATH])) as Record<string, unknown>;
  change(entries, manifest);
  entries[PROJECT_MANIFEST_PATH] = strToU8(JSON.stringify(manifest));
  return zipSync(entries);
}

function errorOf(action: () => unknown): { code: ProjectFileErrorCode; detail?: string } {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError);
    const { code, detail } = error as ProjectFileError;
    return { code, detail };
  }
  throw new Error('expected a ProjectFileError');
}

describe('project file: round trip', () => {
  it('restores the whole configuration (artwork per wall, wrap layers, handle, print colours) and every file', () => {
    const { configuration, bytes } = exportFixture();
    const project = parseProject(bytes);

    expect(project.adjustments).toEqual([]);
    expect(project.warnings).toEqual([]);
    expect(project.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(project.exportedAt?.toISOString()).toBe(EXPORTED_AT.toISOString());
    expect(project.generator).toEqual({ name: 'paper-bag-configurator', version: '1.2.3' });
    // Deep-equal except the file URLs (archive paths now, fresh object URLs once applied).
    expect(withoutFileUrls(project.configuration)).toEqual(withoutFileUrls(configuration));

    const { panels, wrapLayers } = configuration;
    expect(project.files.get(panels.FRONT.artwork!.id)).toEqual({ bytes: PNG_BYTES, mimeType: 'image/png' });
    expect(project.files.get(panels.BACK.artwork!.id)).toEqual({ bytes: JPEG_BYTES, mimeType: 'image/jpeg' });
    expect(project.files.get(wrapLayers[0].artwork.id)).toEqual({ bytes: WEBP_BYTES, mimeType: 'image/webp' });
  });

  it('stores a file shared by several slots once (deduplicated by artwork id)', () => {
    const { bytes, configuration } = exportFixture();
    const entries = unzipSync(bytes);
    const artworkEntries = Object.keys(entries).filter((name) => name.startsWith('artwork/'));
    // logo (FRONT, LEFT, wrap layer 2) + back + wrap background.
    expect(artworkEntries).toHaveLength(3);
    const manifest = JSON.parse(strFromU8(entries[PROJECT_MANIFEST_PATH]));
    expect(manifest.files.map((file: { fileName: string }) => file.fileName).sort()).toEqual(['back.jpg', 'logo.png', 'wrap.webp']);
    expect(getProjectArtworks(configuration)).toHaveLength(3);
    // The shared logo points at one archive path everywhere.
    const { panels, wrapLayers } = manifest.configuration;
    expect(panels.FRONT.artwork.fileUrl).toBe(panels.LEFT.artwork.fileUrl);
    expect(wrapLayers[1].artwork.fileUrl).toBe(panels.FRONT.artwork.fileUrl);
  });

  it('writes a versioned manifest with file metadata and no object URLs', () => {
    const { bytes, configuration } = exportFixture();
    const manifest = JSON.parse(strFromU8(unzipSync(bytes)[PROJECT_MANIFEST_PATH]));
    expect(manifest).toMatchObject({
      format: PROJECT_FORMAT,
      formatVersion: PROJECT_FORMAT_VERSION,
      exportedAt: EXPORTED_AT.toISOString(),
    });
    expect(manifest.files).toContainEqual({
      artworkId: configuration.panels.BACK.artwork!.id,
      path: expect.stringMatching(/^artwork\/\d+\.jpg$/),
      fileName: 'back.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
      sizeBytes: JPEG_BYTES.length,
    });
    expect(JSON.stringify(manifest)).not.toContain('blob:');
  });

  it('keeps unknown / future fields of the configuration', () => {
    const { configuration, files } = fixtureProject();
    const extended = {
      ...configuration,
      glueFlapWidth: 15,
      futureOptions: { lamination: 'MATT', nested: [1, 2, 3] },
      panels: { ...configuration.panels, FRONT: { ...configuration.panels.FRONT, note: 'keep me' } },
      print: { ...configuration.print, varnish: true },
    };
    const bytes = serializeProject({ configuration: extended, files, exportedAt: EXPORTED_AT, appVersion: 'x' });
    const loaded = parseProject(bytes).configuration as unknown as typeof extended;
    expect(loaded.glueFlapWidth).toBe(15);
    expect(loaded.futureOptions).toEqual({ lamination: 'MATT', nested: [1, 2, 3] });
    expect(loaded.panels.FRONT.note).toBe('keep me');
    expect(loaded.print.varnish).toBe(true);
  });

  it('carries artwork found in slots it does not know about (located by shape)', () => {
    const { configuration, files } = fixtureProject();
    const extra = fixtureArtwork('inside.png', 'image/png');
    const extended = { ...configuration, insidePrint: { artwork: extra } };
    const bytes = serializeProject({
      configuration: extended,
      files: new Map([...files, [extra.id, PNG_BYTES]]),
      exportedAt: EXPORTED_AT,
      appVersion: 'x',
    });
    const project = parseProject(bytes);
    expect(project.files.get(extra.id)?.bytes).toEqual(PNG_BYTES);
  });

  it('uses the real image type when the declared one is wrong', () => {
    const { configuration, files } = fixtureProject();
    const logoId = configuration.panels.FRONT.artwork!.id;
    const bytes = serializeProject({
      configuration,
      files: new Map([...files, [logoId, JPEG_BYTES]]),
      exportedAt: EXPORTED_AT,
      appVersion: 'x',
    });
    const project = parseProject(bytes);
    expect(project.configuration.panels.FRONT.artwork!.mimeType).toBe('image/jpeg');
    expect(project.files.get(logoId)?.mimeType).toBe('image/jpeg');
  });
});

describe('project file: older data', () => {
  it('round-trips the whole-sheet layout (SHEET layers with their placements and files)', () => {
    const { configuration, files } = fixtureProject();
    const sheetFile = fixtureArtwork('sheet.webp', 'image/webp', 5220, 3300);
    configuration.artworkLayout = 'SHEET';
    configuration.sheetLayers = [
      createWrapLayer(sheetFile, { mode: 'FILL', extendToBottom: true }),
      createWrapLayer(configuration.wrapLayers[1].artwork, { mode: 'CUSTOM', offsetX: -40, offsetY: 30, scale: 0.2, rotation: 90, extendToBottom: true }),
    ];
    files.set(sheetFile.id, WEBP_BYTES);
    const project = parseProject(serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: '1.2.3' }));
    expect(project.adjustments).toEqual([]);
    expect(withoutFileUrls(project.configuration)).toEqual(withoutFileUrls(configuration));
    expect(project.configuration.artworkLayout).toBe('SHEET');
    expect(project.files.get(sheetFile.id)).toEqual({ bytes: WEBP_BYTES, mimeType: 'image/webp' });
  });

  it('migrates a legacy single wrapArtwork to one layer', () => {
    const { bytes, configuration } = exportFixture();
    const wrap = configuration.wrapLayers[0];
    const migrated = repack(bytes, (_entries, manifest) => {
      const stored = manifest.configuration as Record<string, unknown>;
      const layers = stored.wrapLayers as { artwork: unknown; placement: unknown }[];
      delete stored.wrapLayers;
      stored.wrapArtwork = { artwork: layers[0].artwork, placement: { mode: 'FILL' } };
    });
    const project = parseProject(migrated);
    expect(project.configuration).not.toHaveProperty('wrapArtwork');
    expect(project.configuration.wrapLayers).toHaveLength(1);
    expect(project.configuration.wrapLayers[0]).toMatchObject({
      id: legacyWrapLayerId(wrap.artwork),
      artwork: { id: wrap.artwork.id, fileName: 'wrap.webp' },
      placement: { mode: 'FILL', extendToBottom: false },
    });
    // A missing extendToBottom is older data, not an adjustment.
    expect(project.adjustments).toEqual([]);
  });

  it('reads the older configuration JSON download; its artwork cannot be restored', () => {
    const { configuration } = fixtureProject();
    const legacy: Record<string, unknown> = { ...configuration };
    delete legacy.artworkLayout;
    delete legacy.wrapLayers;
    legacy.print = { technology: 'FLEXO', pantoneColors: configuration.print.pantoneColors };
    const project = parseProject(strToU8(JSON.stringify(legacy, null, 2)));
    expect(project.warnings).toEqual(['LEGACY_CONFIGURATION', 'ARTWORK_NOT_INCLUDED']);
    expect(project.formatVersion).toBeNull();
    expect(project.files.size).toBe(0);
    expect(Object.values(project.configuration.panels).every((panel) => panel.artwork === null)).toBe(true);
    expect(project.configuration.artworkLayout).toBe('PER_PANEL');
    expect(project.configuration.wrapLayers).toEqual([]);
    expect(project.configuration.print.colorAnalysis).toEqual({ mergeTolerance: 10, minAreaShare: 0.005 });
    expect(project.configuration.dimensions).toEqual(configuration.dimensions);
    expect(project.configuration.handle).toEqual(configuration.handle);
  });

  it('reads a configuration JSON without artwork with no warnings except the legacy one', () => {
    const project = parseProject(strToU8(`﻿  ${JSON.stringify(createConfiguration('BLOCK'))}`));
    expect(project.warnings).toEqual(['LEGACY_CONFIGURATION']);
  });
});

describe('project file: errors', () => {
  it('rejects empty and foreign files', () => {
    expect(errorOf(() => parseProject(new Uint8Array()))).toEqual({ code: 'EMPTY_FILE', detail: undefined });
    expect(errorOf(() => parseProject(PNG_BYTES)).code).toBe('NOT_A_PROJECT');
    expect(errorOf(() => parseProject(strToU8('{"hello": "world"}'))).code).toBe('NOT_A_PROJECT');
    expect(errorOf(() => parseProject(strToU8('{ not json'))).code).toBe('NOT_A_PROJECT');
    expect(errorOf(() => parseProject(zipSync({ 'readme.txt': strToU8('hi') }))).code).toBe('NOT_A_PROJECT');
    const otherFormat = zipSync({ [PROJECT_MANIFEST_PATH]: strToU8(JSON.stringify({ format: 'something-else' })) });
    expect(errorOf(() => parseProject(otherFormat)).code).toBe('NOT_A_PROJECT');
  });

  it('rejects files written by a newer version with the version in the detail', () => {
    const newer = repack(exportFixture().bytes, (_entries, manifest) => {
      manifest.formatVersion = PROJECT_FORMAT_VERSION + 1;
    });
    expect(errorOf(() => parseProject(newer))).toEqual({ code: 'NEWER_VERSION', detail: String(PROJECT_FORMAT_VERSION + 1) });
  });

  it('reports a missing artwork file by its name', () => {
    const missing = repack(exportFixture().bytes, (entries, manifest) => {
      const back = (manifest.files as { fileName: string; path: string }[]).find((file) => file.fileName === 'back.jpg')!;
      delete entries[back.path];
    });
    expect(errorOf(() => parseProject(missing))).toEqual({ code: 'MISSING_FILE', detail: 'back.jpg' });

    const unlisted = repack(exportFixture().bytes, (_entries, manifest) => {
      manifest.files = (manifest.files as { fileName: string }[]).filter((file) => file.fileName !== 'wrap.webp');
    });
    expect(errorOf(() => parseProject(unlisted))).toEqual({ code: 'MISSING_FILE', detail: 'wrap.webp' });
  });

  it('reports corrupt data', () => {
    const { bytes } = exportFixture();
    expect(errorOf(() => parseProject(bytes.subarray(0, bytes.length - 40))).code).toBe('CORRUPT_DATA');

    const badJson = unzipSync(bytes);
    badJson[PROJECT_MANIFEST_PATH] = strToU8('{"format": ');
    expect(errorOf(() => parseProject(zipSync(badJson))).code).toBe('CORRUPT_DATA');

    const notImage = repack(bytes, (entries, manifest) => {
      const back = (manifest.files as { fileName: string; path: string }[]).find((file) => file.fileName === 'back.jpg')!;
      entries[back.path] = strToU8('definitely not a jpeg');
    });
    expect(errorOf(() => parseProject(notImage))).toEqual({ code: 'CORRUPT_DATA', detail: 'back.jpg' });

    const badVersion = repack(bytes, (_entries, manifest) => {
      manifest.formatVersion = 'one';
    });
    expect(errorOf(() => parseProject(badVersion)).code).toBe('CORRUPT_DATA');

    const noConfiguration = repack(bytes, (_entries, manifest) => {
      manifest.configuration = { hello: 'world' };
    });
    expect(errorOf(() => parseProject(noConfiguration)).code).toBe('CORRUPT_DATA');
  });

  it('rejects an unknown bag type', () => {
    const unknownType = repack(exportFixture().bytes, (_entries, manifest) => {
      (manifest.configuration as Record<string, unknown>).productType = 'TRIANGULAR';
    });
    expect(errorOf(() => parseProject(unknownType))).toEqual({ code: 'UNSUPPORTED_PRODUCT_TYPE', detail: 'TRIANGULAR' });
  });

  it('rejects an oversized manifest before inflating it', () => {
    const huge = zipSync({
      [PROJECT_MANIFEST_PATH]: strToU8(`{"format":"${PROJECT_FORMAT}","pad":"${' '.repeat(PROJECT_FILE_RULES.maxManifestBytes)}"}`),
    });
    expect(errorOf(() => parseProject(huge)).code).toBe('TOO_LARGE');
  });

  it('rejects archives with too many files', () => {
    const entries: Record<string, Uint8Array> = { [PROJECT_MANIFEST_PATH]: strToU8('{}') };
    for (let i = 0; i <= PROJECT_FILE_RULES.maxFiles; i += 1) entries[`artwork/${i}.png`] = PNG_BYTES;
    expect(errorOf(() => parseProject(zipSync(entries))).code).toBe('TOO_MANY_FILES');
  });

  it('refuses to export without the bytes of every artwork', () => {
    const { configuration, files } = fixtureProject();
    files.delete(configuration.panels.BACK.artwork!.id);
    expect(
      errorOf(() => serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: 'x' })),
    ).toEqual({ code: 'MISSING_FILE', detail: 'back.jpg' });
  });

  it('refuses to export more artwork files than a project may hold', () => {
    const extra = Array.from({ length: PROJECT_FILE_RULES.maxFiles + 1 }, (_, i) => fixtureArtwork(`${i}.png`, 'image/png'));
    const configuration = { ...createConfiguration('BLOCK'), extra };
    const files = new Map(extra.map((artwork) => [artwork.id, PNG_BYTES]));
    expect(errorOf(() => serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: 'x' })).code).toBe(
      'TOO_MANY_FILES',
    );
  });
});

describe('project file: helpers', () => {
  it('names the file after type, W×H×D and the local date', () => {
    const { configuration } = fixtureProject();
    expect(getProjectFileName(configuration, new Date(2026, 8, 30, 23, 59), 'projekt-torby')).toBe(
      'projekt-torby-block-250x300x100-2026-09-30.bagproj',
    );
    expect(getProjectFileName(configuration, new Date(2026, 0, 5), 'bag project / v2')).toBe(
      'bag-project-v2-block-250x300x100-2026-01-05.bagproj',
    );
  });

  it('recognises PNG, JPEG and WEBP data', () => {
    expect(sniffImageMimeType(PNG_BYTES)).toBe('image/png');
    expect(sniffImageMimeType(JPEG_BYTES)).toBe('image/jpeg');
    expect(sniffImageMimeType(WEBP_BYTES)).toBe('image/webp');
    expect(sniffImageMimeType(strToU8('GIF89a'))).toBeNull();
  });

  it('mapArtworks can empty a slot', () => {
    const { configuration } = fixtureProject();
    const emptied = mapArtworks(configuration, () => null);
    expect(emptied.panels.FRONT.artwork).toBeNull();
    expect(configuration.panels.FRONT.artwork).not.toBeNull();
  });
});

describe('project file: gusseted bag (FOLDED)', () => {
  /** The client example 140 + 90 × 370 with seam s = 18, MG kraft 45 g/m², per-wall artwork and two wrap layers. */
  function foldedProject() {
    const front = fixtureArtwork('front.png', 'image/png', 700, 1850);
    const wrap = fixtureArtwork('wrap.webp', 'image/webp', 2800, 800);
    const configuration = createConfiguration('FOLDED');
    configuration.glueFlapWidth = 18;
    configuration.paper = { type: 'MG_KRAFT', color: 'WHITE', grammage: 45, fscCertified: true, moistureBarrier: false };
    configuration.panels.FRONT = { ...configuration.panels.FRONT, artwork: front };
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = [
      createWrapLayer(wrap, { mode: 'FILL', extendToBottom: false }),
      createWrapLayer(front, { mode: 'CUSTOM', offsetX: 50, offsetY: 20, scale: 0.4, rotation: 0, extendToBottom: false }),
    ];
    const files = new Map<string, Uint8Array>([
      [front.id, PNG_BYTES],
      [wrap.id, WEBP_BYTES],
    ]);
    return { configuration, files };
  }

  it('round-trips a gusseted bag without adjustments', () => {
    const { configuration, files } = foldedProject();
    const project = parseProject(serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: 'x' }));
    expect(project.adjustments).toEqual([]);
    expect(withoutFileUrls(project.configuration)).toEqual(withoutFileUrls(configuration));
    expect(project.configuration).toMatchObject({ productType: 'FOLDED', glueFlapWidth: 18, handle: null });
    expect(project.configuration.dimensions).toEqual({ width: 140, height: 370, depth: 90 });
  });

  it('constrains an invalid gusseted bag on load: F ≤ W, no handle, its papers, no "extend to bottom"', () => {
    const { configuration, files } = foldedProject();
    const exported = serializeProject({ configuration, files, exportedAt: EXPORTED_AT, appVersion: 'x' });
    const bytes = repack(exported, (_entries, manifest) => {
      const c = manifest.configuration as Record<string, unknown>;
      const panels = c.panels as Record<string, Record<string, unknown>>;
      const layers = c.wrapLayers as unknown as Record<string, unknown>[];
      c.dimensions = { width: 120, height: 900, depth: 200 };
      c.handle = createHandle('TWISTED_PAPER');
      c.paper = { ...(c.paper as object), type: 'COATED', grammage: 100, moistureBarrier: true };
      c.glueFlapWidth = 40;
      panels.FRONT.placement = { mode: 'FILL', extendToBottom: true };
      layers[0].placement = { mode: 'FILL', extendToBottom: true };
    });
    const { configuration: loaded, adjustments } = parseProject(bytes);
    expect(loaded.productType).toBe('FOLDED');
    expect(loaded.dimensions).toEqual({ width: 120, height: 670, depth: 120 });
    expect(loaded.handle).toBeNull();
    expect(loaded.paper).toMatchObject({ type: 'KRAFT', grammage: 60, moistureBarrier: false });
    expect(loaded.glueFlapWidth).toBe(20);
    expect(loaded.panels.FRONT.placement.extendToBottom).toBe(false);
    expect(loaded.wrapLayers.map((layer) => layer.placement.extendToBottom)).toEqual([false, false]);
    expect(loaded.wrapLayers).toHaveLength(2);
    const fields = adjustments.map((a) => `${a.section}:${a.field}`);
    expect(fields).toEqual(
      expect.arrayContaining([
        'dimensions:height',
        'dimensions:depth',
        'dimensions:glueFlapWidth',
        'artwork:panels.FRONT.placement.extendToBottom',
        `artwork:wrapLayers.${loaded.wrapLayers[0].id}.placement.extendToBottom`,
      ]),
    );
    expect(adjustments.some((a) => a.section === 'handle')).toBe(true);
    expect(adjustments.some((a) => a.section === 'paper')).toBe(true);
  });

  it('names the file with the gusseted-bag notation W + F × H', () => {
    expect(getProjectFileName(foldedProject().configuration, new Date(2026, 8, 30), 'projekt-torby')).toBe(
      'projekt-torby-folded-140+90x370-2026-09-30.bagproj',
    );
  });
});
