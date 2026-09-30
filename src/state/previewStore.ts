import { create } from 'zustand';
import {
  ASSEMBLY_TIMELINE_SHARE,
  getAssemblyPhase,
  splitPreviewTimeline,
  type AssemblyPhaseId,
} from '../domain/geometry/assemblyKinematics';

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
  /** Play / pause; playing from the end (1) restarts from the flat sheet. */
  togglePlaying: () => void;
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
  togglePlaying: () => {
    const { playing, progress, viewMode } = get();
    if (playing) {
      set({ playing: false });
      return;
    }
    const start = progress >= 1 ? 0 : progress;
    set({ playing: true, progress: start, viewMode: viewMode === 'DIELINE' ? viewMode : findTimelinePreset(start) });
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
