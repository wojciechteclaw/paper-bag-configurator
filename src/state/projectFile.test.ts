import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapLayerTarget } from '../domain/artworkLayout';
import { createConfiguration } from '../domain/factories';
import { collectArtworks, ProjectFileError, type ProjectFileErrorCode } from '../domain/project';
import { fixtureProject, withoutFileUrls } from '../domain/project/testFixtures';
import type { Artwork } from '../domain/types';
import { useConfigurationStore } from './configurationStore';
import { CONFIGURATOR_STEPS, useConfiguratorUiStore } from './configuratorUiStore';
import { DEFAULT_PREVIEW_VIEW_MODE, TIMELINE_PRESETS, usePreviewStore } from './previewStore';
import {
  applyProject,
  applyProjectView,
  exportProject,
  hasUnsavedChanges,
  loadProject,
  readProjectFile,
  useProjectStore,
} from './projectFile';

const store = () => useConfigurationStore.getState();

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let created: string[];

beforeEach(() => {
  created = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:loaded/${created.length + 1}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  const fresh = createConfiguration('BLOCK');
  useConfigurationStore.setState({ configuration: fresh });
  useProjectStore.getState().markSaved(fresh);
  useConfiguratorUiStore.setState({ step: CONFIGURATOR_STEPS[0], selectedArtwork: null });
  usePreviewStore.setState({ viewMode: 'BOX', progress: 0.4, playing: false });
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

/** Artwork reader over the fixture's bytes (tests have no fetchable object URLs). */
function readerFor(files: Map<string, Uint8Array>) {
  return vi.fn(async (artwork: Artwork) => {
    const bytes = files.get(artwork.id);
    if (!bytes) throw new Error('gone');
    return bytes;
  });
}

async function exportFixture() {
  const { configuration, files } = fixtureProject();
  store().replaceConfiguration(configuration);
  const readArtwork = readerFor(files);
  const exported = await exportProject({ fileNamePrefix: 'projekt-torby', readArtwork, now: new Date(2026, 8, 30) });
  return { configuration, files, readArtwork, exported };
}

async function codeOf(promise: Promise<unknown>): Promise<ProjectFileErrorCode> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError);
    return (error as ProjectFileError).code;
  }
  throw new Error('expected a ProjectFileError');
}

describe('exportProject', () => {
  it('reads each artwork once and names the file after the bag', async () => {
    const { exported, readArtwork } = await exportFixture();
    expect(exported.fileName).toBe('projekt-torby-block-250x300x100-2026-09-30.bagproj');
    expect(exported.blob.type).toBe('application/zip');
    expect(readArtwork).toHaveBeenCalledTimes(3);
  });

  it('marks the project as saved', async () => {
    const { configuration } = fixtureProject();
    store().replaceConfiguration(configuration);
    expect(hasUnsavedChanges()).toBe(true);
    await exportProject({ fileNamePrefix: 'p', readArtwork: readerFor(fixtureProject().files) }).catch(() => undefined);
    // The reader above has other ids: the export failed and nothing was marked saved.
    expect(hasUnsavedChanges()).toBe(true);
    await exportFixture();
    expect(hasUnsavedChanges()).toBe(false);
    store().setDimension('height', 350);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('reports artwork whose file cannot be read any more', async () => {
    const { configuration } = fixtureProject();
    store().replaceConfiguration(configuration);
    const code = await codeOf(exportProject({ fileNamePrefix: 'p', readArtwork: readerFor(new Map()) }));
    expect(code).toBe('MISSING_FILE');
  });
});

describe('view state', () => {
  /** Exports the fixture with the given view (set in the stores), then resets the stores to other values. */
  async function exportWithView(set: () => void) {
    const { configuration, files } = fixtureProject();
    store().replaceConfiguration(configuration);
    set();
    const exported = await exportProject({ fileNamePrefix: 'p', readArtwork: readerFor(files) });
    useConfiguratorUiStore.setState({ step: 'production', selectedArtwork: 'FRONT' });
    usePreviewStore.setState({ viewMode: 'FLAT', progress: 1, playing: true });
    return { configuration, exported };
  }

  it('saves and restores the step, preview mode, fold slider and selected layer', async () => {
    const { configuration, exported } = await exportWithView(() => {
      useConfiguratorUiStore.setState({ step: 'artwork', selectedArtwork: wrapLayerTarget(store().configuration.wrapLayers[1].id) });
      usePreviewStore.setState({ viewMode: 'DIELINE', progress: 0.27 });
    });

    await loadProject(exported.blob);

    expect(useConfiguratorUiStore.getState()).toMatchObject({
      step: 'artwork',
      selectedArtwork: wrapLayerTarget(configuration.wrapLayers[1].id),
    });
    expect(usePreviewStore.getState()).toMatchObject({ viewMode: 'DIELINE', progress: 0.27, playing: false });
  });

  it('restores a custom slider position between presets', async () => {
    const { exported } = await exportWithView(() => {
      useConfiguratorUiStore.setState({ step: 'summary', selectedArtwork: null });
      usePreviewStore.getState().setProgress(0.62);
    });
    await loadProject(exported.blob);
    expect(useConfiguratorUiStore.getState().step).toBe('summary');
    expect(usePreviewStore.getState()).toMatchObject({ viewMode: null, progress: 0.62, playing: false });
  });

  it('moves the timeline to the preset of a saved 3D mode', () => {
    applyProjectView({ previewMode: 'STANDING', timelineProgress: 0.9 }, createConfiguration('BLOCK'));
    expect(usePreviewStore.getState()).toMatchObject({ viewMode: 'STANDING', progress: TIMELINE_PRESETS.STANDING });
    applyProjectView({ previewMode: null, timelineProgress: 1 }, createConfiguration('BLOCK'));
    expect(usePreviewStore.getState()).toMatchObject({ viewMode: 'FLAT', progress: 1 });
  });

  it('opens a project without a saved view in the default view', async () => {
    const { configuration, files } = fixtureProject();
    store().replaceConfiguration(configuration);
    const exported = await exportProject({ fileNamePrefix: 'p', readArtwork: readerFor(files), view: null });
    useConfiguratorUiStore.setState({ step: 'production', selectedArtwork: 'FRONT' });
    usePreviewStore.setState({ viewMode: 'DIELINE', progress: 0.1, playing: true });

    await loadProject(exported.blob);

    expect(useConfiguratorUiStore.getState()).toMatchObject({ step: CONFIGURATOR_STEPS[0], selectedArtwork: null });
    expect(usePreviewStore.getState()).toMatchObject({
      viewMode: DEFAULT_PREVIEW_VIEW_MODE,
      progress: TIMELINE_PRESETS[DEFAULT_PREVIEW_VIEW_MODE],
      playing: false,
    });
  });

  it('drops a saved selection that is not artwork of the loaded project', () => {
    applyProjectView({ step: 'artwork', selectedArtwork: 'FRONT' }, createConfiguration('BLOCK'));
    expect(useConfiguratorUiStore.getState()).toMatchObject({ step: 'artwork', selectedArtwork: null });
  });

  it('does not count view changes as unsaved changes', async () => {
    await exportFixture();
    useConfiguratorUiStore.setState({ step: 'summary' });
    usePreviewStore.getState().setViewMode('FLAT');
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe('loadProject', () => {
  it('restores the exported configuration with fresh object URLs', async () => {
    const { configuration, exported } = await exportFixture();
    store().replaceConfiguration(createConfiguration('BLOCK'));

    await loadProject(exported.blob);

    const loaded = store().configuration;
    expect(withoutFileUrls(loaded)).toEqual(withoutFileUrls(configuration));
    const urls = new Set(collectArtworks(loaded).map((artwork) => artwork.fileUrl));
    expect([...urls].sort()).toEqual([...created].sort());
    expect(created).toHaveLength(3);
    // The shared logo uses one object URL everywhere.
    expect(loaded.panels.FRONT.artwork!.fileUrl).toBe(loaded.wrapLayers[1].artwork.fileUrl);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('revokes the previous object URLs', async () => {
    const { exported, configuration } = await exportFixture();
    const previousUrls = collectArtworks(configuration).map((artwork) => artwork.fileUrl);

    await loadProject(exported.blob);

    previousUrls.forEach((url) => expect(URL.revokeObjectURL).toHaveBeenCalledWith(url));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(expect.stringMatching(/^blob:loaded/));
  });

  it('leaves the current project untouched when the file is invalid', async () => {
    const before = store().configuration;
    const code = await codeOf(loadProject(new Blob(['not a project'])));
    expect(code).toBe('NOT_A_PROJECT');
    expect(store().configuration).toBe(before);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized files before reading them', async () => {
    expect(await codeOf(readProjectFile(new Blob([])))).toBe('EMPTY_FILE');
    const huge = { size: 1024 * 1024 * 1024, arrayBuffer: vi.fn() } as unknown as Blob;
    expect(await codeOf(readProjectFile(huge))).toBe('TOO_LARGE');
    expect(huge.arrayBuffer).not.toHaveBeenCalled();
  });

  it('applyProject keeps object URLs the new configuration still uses', async () => {
    const { exported } = await exportFixture();
    const project = await readProjectFile(exported.blob);
    applyProject(project);
    const first = store().configuration;
    vi.mocked(URL.revokeObjectURL).mockClear();
    // Re-applying the same configuration object must not revoke URLs it keeps.
    store().replaceConfiguration(first);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
