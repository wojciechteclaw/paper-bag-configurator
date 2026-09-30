import { create } from 'zustand';
import {
  getProjectArtworks,
  getProjectFileName,
  mapArtworks,
  parseProject,
  ProjectFileError,
  sanitizeProjectView,
  serializeProject,
  type ParsedProject,
  type ProjectViewState,
} from '../domain/project';
import { PROJECT_FILE_RULES } from '../domain/config/productCatalog';
import type { Artwork, BagConfiguration } from '../domain/types';
import { useConfigurationStore } from './configurationStore';
import { CONFIGURATOR_STEPS, useConfiguratorUiStore } from './configuratorUiStore';
import {
  DEFAULT_PREVIEW_VIEW_MODE,
  findTimelinePreset,
  PREVIEW_VIEW_MODES,
  getTimelinePresets,
  usePreviewStore,
} from './previewStore';

// Saving / loading whole projects (docs/SPEC.md §4h). The file format lives in the domain (`src/domain/project`);
// this module moves artwork between object URLs and file bytes and swaps the store's configuration.

/** Snapshot used to decide whether the current project has changes that were not saved (or loaded). */
const snapshotOf = (configuration: BagConfiguration) => JSON.stringify(configuration);

type ProjectState = {
  /** Snapshot of the configuration as last saved / loaded (initially: the fresh default configuration). */
  savedSnapshot: string;
  markSaved: (configuration: BagConfiguration) => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  savedSnapshot: snapshotOf(useConfigurationStore.getState().configuration),
  markSaved: (configuration) => set({ savedSnapshot: snapshotOf(configuration) }),
}));

/** True when the configuration differs from what was last saved or loaded (or from the start state). */
export function hasUnsavedChanges(): boolean {
  return snapshotOf(useConfigurationStore.getState().configuration) !== useProjectStore.getState().savedSnapshot;
}

/** Reads the bytes behind an artwork's URL (an object URL, or an app asset such as the demo images). */
export type ArtworkReader = (artwork: Artwork) => Promise<Uint8Array>;

const fetchArtwork: ArtworkReader = async (artwork) => {
  const response = await fetch(artwork.fileUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

export type ExportedProject = { blob: Blob; fileName: string };

/**
 * Builds the project file of `configuration` (default: the current one) and marks it as saved. Artwork bytes are read
 * once per artwork id. Throws `ProjectFileError` (MISSING_FILE when an image cannot be read any more, TOO_LARGE, …).
 */
export async function exportProject(options: {
  fileNamePrefix: string;
  configuration?: BagConfiguration;
  readArtwork?: ArtworkReader;
  now?: Date;
  /** View state stored with the project; default: the current one (`getCurrentProjectView`), null = none. */
  view?: ProjectViewState | null;
}): Promise<ExportedProject> {
  const configuration = options.configuration ?? useConfigurationStore.getState().configuration;
  const view = options.view === undefined ? getCurrentProjectView() : (options.view ?? undefined);
  const readArtwork = options.readArtwork ?? fetchArtwork;
  const exportedAt = options.now ?? new Date();
  const files = new Map<string, Uint8Array>();
  for (const artwork of getProjectArtworks(configuration)) {
    try {
      files.set(artwork.id, await readArtwork(artwork));
    } catch {
      throw new ProjectFileError('MISSING_FILE', artwork.fileName);
    }
  }
  const bytes = serializeProject({ configuration, files, exportedAt, appVersion: __APP_VERSION__, view });
  useProjectStore.getState().markSaved(configuration);
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: PROJECT_FILE_RULES.mimeType }),
    fileName: getProjectFileName(configuration, exportedAt, options.fileNamePrefix),
  };
}

/** Reads and validates a project file without touching the current configuration. Throws `ProjectFileError`. */
export async function readProjectFile(file: Blob): Promise<ParsedProject> {
  if (file.size === 0) throw new ProjectFileError('EMPTY_FILE');
  if (file.size > PROJECT_FILE_RULES.maxFileSizeBytes) throw new ProjectFileError('TOO_LARGE');
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ProjectFileError('CORRUPT_DATA');
  }
  return parseProject(bytes);
}

/** The view state saved with a project: wizard step, preview mode, fold-slider position, selected artwork. */
export function getCurrentProjectView(): ProjectViewState {
  const { step, selectedArtwork } = useConfiguratorUiStore.getState();
  const { viewMode, progress } = usePreviewStore.getState();
  return { step, previewMode: viewMode, timelineProgress: progress, selectedArtwork };
}

/**
 * Restores the view state of a loaded project (sanitised against the loaded configuration; a missing section or
 * field → the default view). Playback always stops. A 3D preset mode moves the timeline to its preset; a custom
 * slider position (null mode) selects the preset it lands on exactly, like the slider does.
 */
export function applyProjectView(raw: unknown, configuration: BagConfiguration) {
  const view = sanitizeProjectView(raw, {
    steps: CONFIGURATOR_STEPS,
    previewModes: PREVIEW_VIEW_MODES,
    defaultPreviewMode: DEFAULT_PREVIEW_VIEW_MODE,
    defaultTimelineProgress: getTimelinePresets(configuration.productType)[DEFAULT_PREVIEW_VIEW_MODE],
    configuration,
  });
  const mode = view.previewMode;
  const progress =
    mode === null || mode === 'DIELINE' ? view.timelineProgress : getTimelinePresets(configuration.productType)[mode];
  usePreviewStore.setState({
    viewMode: mode === null ? findTimelinePreset(progress, configuration.productType) : mode,
    progress,
    playing: false,
  });
  useConfiguratorUiStore.setState({ step: view.step, selectedArtwork: view.selectedArtwork });
}

/**
 * Makes a parsed project the current one: object URLs for its images, the configuration replaced (URLs of the
 * previous artwork revoked), the saved view state restored (`applyProjectView`: step, preview mode, fold slider,
 * selected artwork — defaults when the file has none), and the project marked as saved.
 */
export function applyProject(project: ParsedProject): BagConfiguration {
  const urls = new Map<string, string>();
  project.files.forEach((file, artworkId) => {
    urls.set(artworkId, URL.createObjectURL(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mimeType })));
  });
  const configuration = mapArtworks(project.configuration, (artwork) => {
    const url = urls.get(artwork.id);
    return url ? { ...artwork, fileUrl: url } : null;
  });
  useConfigurationStore.getState().replaceConfiguration(configuration);
  applyProjectView(project.view, configuration);
  useProjectStore.getState().markSaved(configuration);
  return configuration;
}

/** `readProjectFile` + `applyProject`. Throws `ProjectFileError`; the current project is unchanged on failure. */
export async function loadProject(file: Blob): Promise<ParsedProject> {
  const project = await readProjectFile(file);
  applyProject(project);
  return project;
}
