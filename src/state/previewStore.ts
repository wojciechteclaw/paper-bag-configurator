import { create } from 'zustand';
import {
  ASSEMBLY_PHASES,
  ASSEMBLY_TIMELINE_SHARE,
  getAssemblyPhase,
  splitPreviewTimeline,
  type AssemblyPhaseId,
} from '../domain/geometry/assemblyKinematics';
import type { BagType } from '../domain/types';

// View state of the preview (docs/SPEC.md §4a, §4c). Deliberately NOT part of BagConfiguration.
//
// One continuous 3D timeline on the fold slider (client decision): flat sheet (0) → tube → side triangles in → front
// flap → back flap on top → formed open bag (BOX, ASSEMBLY_TIMELINE_SHARE = 0.4) → standing → folded flat (1).
// The 3D mode buttons are presets on that timeline; the 2D dieline is a separate view.

/** Preview modes: 2D dieline, and the 3D presets flat sheet / open box / naturally standing / folded flat. */
export type PreviewViewMode = 'DIELINE' | 'SHEET' | 'BOX' | 'STANDING' | 'FLAT';
export type TimelineViewMode = Exclude<PreviewViewMode, 'DIELINE'>;

export const PREVIEW_VIEW_MODES: readonly PreviewViewMode[] = ['DIELINE', 'SHEET', 'BOX', 'STANDING', 'FLAT'];

/** Resolution of the timeline slider (1 %); presets are rounded to it so the slider can land on them exactly. */
export const TIMELINE_SLIDER_STEP = 0.01;

/** Seconds for the play button to run the whole timeline 0 → 1. */
export const TIMELINE_PLAY_DURATION_S = 14;

/**
 * Timeline value of each 3D preset. SHEET = 0, BOX = end of the assembly (0.4), FLAT = 1. STANDING = 0.45 (client
 * [K], 30.09.2026: fold p = 1/12, just after the bag starts to fold; was the 45° side-triangle pose at 0.55).
 */
export const TIMELINE_PRESETS: Readonly<Record<TimelineViewMode, number>> = {
  SHEET: 0,
  BOX: ASSEMBLY_TIMELINE_SHARE,
  STANDING: 0.45,
  FLAT: 1,
};

const PRESET_TOLERANCE = 1e-9;

const toSliderStep = (t: number) => Math.round(t / TIMELINE_SLIDER_STEP) * TIMELINE_SLIDER_STEP;

/**
 * Chapter stops of the timeline for the skip buttons (like a remote's previous / next chapter), ascending: the start
 * of every assembly phase (sheet 0, sides 16 %, front flap 24 %, back flap 32 %) and every 3D preset (formed 40 %,
 * after the fold 45 %, flat 100 %). On the 1 % slider grid.
 */
export const TIMELINE_STOPS: readonly number[] = [
  ...new Set(
    [
      ...Object.values(ASSEMBLY_PHASES).map(([start]) => start * ASSEMBLY_TIMELINE_SHARE),
      ...Object.values(TIMELINE_PRESETS),
    ].map((t) => Number(toSliderStep(t).toFixed(2))),
  ),
].sort((a, b) => a - b);

/**
 * The next stop after `progress` (direction 1) or the previous one before it (−1); null at the end. Only stops from
 * `timelineStart` on count (the gusseted bag's timeline starts at BOX: no assembly stops).
 */
export function getTimelineStop(progress: number, direction: 1 | -1, timelineStart = 0): number | null {
  const stops = TIMELINE_STOPS.filter((stop) => stop >= timelineStart - PRESET_TOLERANCE);
  if (direction > 0) return stops.find((stop) => stop > progress + PRESET_TOLERANCE) ?? null;
  return [...stops].reverse().find((stop) => stop < progress - PRESET_TOLERANCE) ?? null;
}

/** The 3D preset that equals `progress` exactly (within float noise), or null. */
export function findTimelinePreset(progress: number): TimelineViewMode | null {
  const modes = Object.keys(TIMELINE_PRESETS) as TimelineViewMode[];
  return modes.find((m) => Math.abs(TIMELINE_PRESETS[m] - progress) < PRESET_TOLERANCE) ?? null;
}

/**
 * Stage shown next to the slider: the flat sheet, an assembly phase (A, B, C1, C2), the formed open bag (exactly the
 * BOX preset) or the fold towards flat.
 */
export type TimelinePhase = 'SHEET' | AssemblyPhaseId | 'FORMED' | 'FOLD';

export type TimelineState = {
  /** Sheet → formed bag, 0..1 (`assemblyKinematics.ts`). */
  assemblyProgress: number;
  /** Formed open bag → folded flat, 0..1 (`foldKinematics.ts`). */
  foldProgress: number;
  phase: TimelinePhase;
};

/** Derived view of a timeline value (pure). */
export function getTimelineState(progress: number): TimelineState {
  const { assemblyProgress, foldProgress } = splitPreviewTimeline(progress);
  const phase: TimelinePhase =
    assemblyProgress <= 0
      ? 'SHEET'
      : assemblyProgress < 1
        ? getAssemblyPhase(assemblyProgress)
        : foldProgress <= 0
          ? 'FORMED'
          : 'FOLD';
  return { assemblyProgress, foldProgress, phase };
}

// ——— Gusseted bag (FOLDED, docs/SPEC.md §4i) ———
// It is not assembled from the sheet in the MVP: the timeline part before the formed bag (0 … BOX) shows the open bag,
// the rest (BOX … 1) closes the gussets until the bag lies flat. So the SHEET preset is not offered and playback
// starts at BOX.

/** Where the timeline of `productType` starts (playback restarts here). */
export function getTimelineStart(productType: BagType): number {
  return productType === 'FOLDED' ? TIMELINE_PRESETS.BOX : 0;
}

/** Preview modes offered for `productType`: the gusseted-bag bag has no flat-sheet assembly (no SHEET preset). */
export function getPreviewViewModes(productType: BagType): readonly PreviewViewMode[] {
  return productType === 'FOLDED' ? PREVIEW_VIEW_MODES.filter((mode) => mode !== 'SHEET') : PREVIEW_VIEW_MODES;
}

/**
 * `getTimelineState` for a bag type: the gusseted-bag bag is always assembled (assemblyProgress 1) and its phase is
 * FORMED (open) or FOLD (closing towards flat); `foldProgress` 0 = open, 1 = flat, as for the block bottom.
 */
export function getTimelineStateFor(productType: BagType, progress: number): TimelineState {
  if (productType !== 'FOLDED') return getTimelineState(progress);
  const { foldProgress } = splitPreviewTimeline(progress);
  return { assemblyProgress: 1, foldProgress, phase: foldProgress <= 0 ? 'FORMED' : 'FOLD' };
}

type PreviewState = {
  /** Selected mode; null = 3D with a custom slider position that matches no preset. */
  viewMode: PreviewViewMode | null;
  /** The single 3D timeline value 0..1 (0 = flat sheet, 0.4 = formed open bag, 1 = folded flat). */
  progress: number;
  /** Play button: the timeline advances by itself (see `tick`). */
  playing: boolean;
  /** Selects a mode; 3D modes also move the timeline to their preset (the model animates there) and stop playback. */
  setViewMode: (mode: PreviewViewMode) => void;
  /**
   * Timeline slider. Clamped to [0, 1]; NaN is ignored. Stops playback. In 3D, selects the preset it lands on exactly,
   * otherwise deselects the mode (null). In DIELINE only the stored progress changes.
   */
  setProgress: (progress: number) => void;
  /**
   * Play / pause; playing from the end (1) restarts from `timelineStart` (default 0, the flat sheet; the gusseted bag
   * passes `getTimelineStart('FOLDED')`), and playback never starts before it.
   */
  togglePlaying: (timelineStart?: number) => void;
  /**
   * Jumps to the next (1) or previous (−1) chapter stop (`TIMELINE_STOPS` from `timelineStart` on — the gusseted bag
   * passes `getTimelineStart('FOLDED')`, so it only stops at 0.4, 0.45 and 1); stops playback. No-op at the ends.
   */
  skip: (direction: 1 | -1, timelineStart?: number) => void;
  /** Advances a running playback by `deltaSeconds`; stops at 1 (the FLAT preset). */
  tick: (deltaSeconds: number) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const usePreviewStore = create<PreviewState>((set, get) => ({
  viewMode: 'BOX',
  progress: TIMELINE_PRESETS.BOX,
  playing: false,
  setViewMode: (mode) => {
    if (mode === 'DIELINE') set({ viewMode: mode, playing: false });
    else set({ viewMode: mode, progress: TIMELINE_PRESETS[mode], playing: false });
  },
  setProgress: (progress) => {
    if (Number.isNaN(progress)) return;
    const p = clamp01(progress);
    if (get().viewMode === 'DIELINE') set({ progress: p, playing: false });
    else set({ progress: p, viewMode: findTimelinePreset(p), playing: false });
  },
  togglePlaying: (timelineStart = 0) => {
    const { playing, progress, viewMode } = get();
    if (playing) {
      set({ playing: false });
      return;
    }
    const from = clamp01(Number.isFinite(timelineStart) ? timelineStart : 0);
    const start = progress >= 1 ? from : Math.max(progress, from);
    set({ playing: true, progress: start, viewMode: viewMode === 'DIELINE' ? viewMode : findTimelinePreset(start) });
  },
  skip: (direction, timelineStart = 0) => {
    const stop = getTimelineStop(get().progress, direction, timelineStart);
    if (stop !== null) get().setProgress(stop);
  },
  tick: (deltaSeconds) => {
    const { playing, progress, viewMode } = get();
    if (!playing || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const next = clamp01(progress + deltaSeconds / TIMELINE_PLAY_DURATION_S);
    const done = next >= 1;
    set({
      progress: next,
      playing: !done,
      viewMode: viewMode === 'DIELINE' ? viewMode : done ? 'FLAT' : findTimelinePreset(next),
    });
  },
}));

export const is3DViewMode = (mode: PreviewViewMode | null): boolean => mode !== 'DIELINE';
