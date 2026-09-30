import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { wrapLayerTarget } from '../artworkLayout';
import { PROJECT_MANIFEST_PATH, parseProject, serializeProject } from './projectFile';
import { fixtureProject } from './testFixtures';
import { sanitizeProjectView, type ProjectViewState } from './viewState';

const STEPS = ['first', 'artwork', 'summary'] as const;
const MODES = ['DIELINE', 'SHEET', 'BOX'] as const;

function options() {
  const { configuration } = fixtureProject(); // WRAP layout with two layers; walls FRONT / BACK / LEFT have artwork
  return {
    steps: STEPS,
    previewModes: MODES,
    defaultPreviewMode: 'BOX' as const,
    defaultTimelineProgress: 0.4,
    configuration,
  };
}

describe('sanitizeProjectView', () => {
  it('keeps a valid view', () => {
    const opts = options();
    const layer = wrapLayerTarget(opts.configuration.wrapLayers[1].id);
    const view = { step: 'artwork', previewMode: 'DIELINE', timelineProgress: 0.73, selectedArtwork: layer };
    expect(sanitizeProjectView(view, opts)).toEqual(view);
  });

  it('gives the default view for a missing section or missing fields', () => {
    const defaults = { step: 'first', previewMode: 'BOX', timelineProgress: 0.4, selectedArtwork: null };
    expect(sanitizeProjectView(null, options())).toEqual(defaults);
    expect(sanitizeProjectView(undefined, options())).toEqual(defaults);
    expect(sanitizeProjectView({}, options())).toEqual(defaults);
    expect(sanitizeProjectView([1, 2], options())).toEqual(defaults);
  });

  it('replaces unknown values and clamps the timeline', () => {
    const view = { step: 'payment', previewMode: 'HOLOGRAM', timelineProgress: 7, selectedArtwork: 42 };
    expect(sanitizeProjectView(view, options())).toEqual({
      step: 'first',
      previewMode: 'BOX',
      timelineProgress: 1,
      selectedArtwork: null,
    });
    expect(sanitizeProjectView({ timelineProgress: -3 }, options()).timelineProgress).toBe(0);
    expect(sanitizeProjectView({ timelineProgress: Number.NaN }, options()).timelineProgress).toBe(0.4);
  });

  it('keeps an explicit null mode (custom slider position)', () => {
    expect(sanitizeProjectView({ previewMode: null, timelineProgress: 0.66 }, options())).toMatchObject({
      previewMode: null,
      timelineProgress: 0.66,
    });
  });

  it('keeps a selection only when it is artwork of the active layout', () => {
    const opts = options();
    const select = (selectedArtwork: unknown) => sanitizeProjectView({ selectedArtwork }, opts).selectedArtwork;
    // WRAP is active: walls are not selectable, existing layers are.
    expect(select('FRONT')).toBeNull();
    expect(select(wrapLayerTarget(opts.configuration.wrapLayers[0].id))).toBe(wrapLayerTarget(opts.configuration.wrapLayers[0].id));
    expect(select(wrapLayerTarget('gone'))).toBeNull();
    // Per wall: a wall with artwork is selectable, an empty one is not.
    opts.configuration.artworkLayout = 'PER_PANEL';
    expect(select('FRONT')).toBe('FRONT');
    expect(select('RIGHT')).toBeNull();
    expect(select(wrapLayerTarget(opts.configuration.wrapLayers[0].id))).toBeNull();
  });
});

describe('project file: view section', () => {
  const view: ProjectViewState = { step: 'artwork', previewMode: 'DIELINE', timelineProgress: 0.25, selectedArtwork: 'BACK' };

  it('is written to the manifest and returned as stored', () => {
    const { configuration, files } = fixtureProject();
    const bytes = serializeProject({ configuration, files, exportedAt: new Date(), appVersion: 'x', view });
    expect(JSON.parse(strFromU8(unzipSync(bytes)[PROJECT_MANIFEST_PATH])).view).toEqual(view);
    expect(parseProject(bytes).view).toEqual(view);
  });

  it('is optional (older v1 files have none)', () => {
    const { configuration, files } = fixtureProject();
    const bytes = serializeProject({ configuration, files, exportedAt: new Date(), appVersion: 'x' });
    expect(JSON.parse(strFromU8(unzipSync(bytes)[PROJECT_MANIFEST_PATH]))).not.toHaveProperty('view');
    expect(parseProject(bytes).view).toBeNull();
  });
});
