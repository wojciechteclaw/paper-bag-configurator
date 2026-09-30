// View state saved with a project (docs/SPEC.md §4h, client decision [K] 30.09.2026): where the user was when the
// project was saved — wizard step, preview mode, fold-slider position and the artwork selected for editing. Pure TS.
//
// It is NOT part of the product (`BagConfiguration`) and never affects pricing or production data. The manifest
// field `view` is optional (format stays v1): a missing section or field means the default view. The lists of valid
// steps / preview modes belong to the state layer, so they are passed in (`ProjectViewOptions`).

import { getActiveArtworkTargets, getArtworkSlot } from '../artworkLayout';
import type { ArtworkTarget, BagConfiguration } from '../types';

/** The `view` section of the manifest as written. */
export type ProjectViewState = {
  /** Wizard step id (e.g. `artwork`). */
  step: string;
  /** Preview mode (`DIELINE`, `SHEET`, `BOX`, `STANDING`, `FLAT`) or null for a custom 3D slider position. */
  previewMode: string | null;
  /** Fold / assembly timeline 0..1 (the fold slider). */
  timelineProgress: number;
  /** Artwork selected for editing (a wall or `WRAP:<layer id>`), or null. */
  selectedArtwork: ArtworkTarget | null;
};

export type ProjectViewOptions<Step extends string, Mode extends string> = {
  /** Valid steps; the first one is the default. */
  steps: readonly Step[];
  /** Valid preview modes. */
  previewModes: readonly Mode[];
  /** Used when the file has no (valid) mode. */
  defaultPreviewMode: Mode;
  /** Used when the file has no (valid) timeline position. */
  defaultTimelineProgress: number;
  /** The loaded configuration: a selection must be an artwork target of its active layout. */
  configuration: BagConfiguration;
};

export type SanitizedProjectView<Step extends string, Mode extends string> = {
  step: Step;
  previewMode: Mode | null;
  timelineProgress: number;
  selectedArtwork: ArtworkTarget | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A usable view from anything stored: unknown steps / modes → defaults, the timeline clamped to [0, 1], a selection
 * that is not an artwork of the active layout (or has no artwork) → none. `null` / missing input → the default view.
 * A null mode (custom slider position) is kept only when the file stored it explicitly.
 */
export function sanitizeProjectView<Step extends string, Mode extends string>(
  raw: unknown,
  options: ProjectViewOptions<Step, Mode>,
): SanitizedProjectView<Step, Mode> {
  const view = isRecord(raw) ? raw : {};
  const step = options.steps.includes(view.step as Step) ? (view.step as Step) : options.steps[0];
  const previewMode =
    view.previewMode === null && 'previewMode' in view
      ? null
      : options.previewModes.includes(view.previewMode as Mode)
        ? (view.previewMode as Mode)
        : options.defaultPreviewMode;
  const progress = view.timelineProgress;
  const timelineProgress =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.min(1, Math.max(0, progress))
      : options.defaultTimelineProgress;
  const target = view.selectedArtwork;
  const { configuration } = options;
  const selectedArtwork =
    typeof target === 'string' &&
    (getActiveArtworkTargets(configuration) as string[]).includes(target) &&
    getArtworkSlot(configuration, target as ArtworkTarget).artwork !== null
      ? (target as ArtworkTarget)
      : null;
  return { step, previewMode, timelineProgress, selectedArtwork };
}
