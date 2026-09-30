import { create } from 'zustand';
import {
  ASSEMBLY_PHASES,
  ASSEMBLY_TIMELINE_SHARE,
  getAssemblyPhase,
  splitPreviewTimeline,
  type AssemblyPhaseId,
} from '../domain/geometry/assemblyKinematics';
import {
  getGussetedPhase,
  GUSSETED_PHASES,
  GUSSETED_TIMELINE_SHARE,
  splitGussetedTimeline,
  type GussetedPhaseId,
} from '../domain/geometry/gussetedAssembly';
import type { BagType } from '../domain/types';
import { useConfigurationStore } from './configurationStore';

// View state of the preview (docs/SPEC.md §4a, §4c, §4i). Deliberately NOT part of BagConfiguration.
//
// One continuous 3D timeline 0..1 on the fold slider, mapped PER BAG TYPE (explicit table `TIMELINE_DEFINITIONS`):
// - BLOCK (client decision 29.09.2026): flat sheet (0) → tube → side triangles in → front flap → back flap on top →
//   formed open bag (BOX, ASSEMBLY_TIMELINE_SHARE = 0.4) → standing → folded flat (1).
// - FOLDED (client [K] 30.09.2026): flat sheet (0) → gussets tucked → BACK wrapped, seam closed (15 %) → bottom strip
//   folded to the back (30 %) → opening (45 %) → open bag (BOX, GUSSETED_TIMELINE_SHARE = 0.6, the gusseted model's
//   open state) → its fold: STANDING 0.75 (client [K]) → folded flat (FLAT, 1).
// The 3D mode buttons are presets on that timeline; the 2D dieline is a separate view. The store reads the current
// bag type from the configuration store (it never copies it) and keeps a selected preset when the type changes.

/** Preview modes: 2D dieline, and the 3D presets flat sheet / open box / naturally standing / folded flat. */
export type PreviewViewMode = 'DIELINE' | 'SHEET' | 'BOX' | 'STANDING' | 'FLAT';
export type TimelineViewMode = Exclude<PreviewViewMode, 'DIELINE'>;

export const PREVIEW_VIEW_MODES: readonly PreviewViewMode[] = ['DIELINE', 'SHEET', 'BOX', 'STANDING', 'FLAT'];

/** Resolution of the timeline slider (1 %); presets are rounded to it so the slider can land on them exactly. */
export const TIMELINE_SLIDER_STEP = 0.01;

/** Seconds for the play button to run the whole timeline 0 → 1. */
export const TIMELINE_PLAY_DURATION_S = 14;

/**
 * Block bottom: timeline value of each 3D preset. SHEET = 0, BOX = end of the assembly (0.4), FLAT = 1. STANDING =
 * 0.45 (client [K], 30.09.2026: fold p = 1/12, just after the bag starts to fold; was the 45° side-triangle pose at 0.55).
 */
export const TIMELINE_PRESETS: Readonly<Record<TimelineViewMode, number>> = {
  SHEET: 0,
  BOX: ASSEMBLY_TIMELINE_SHARE,
  STANDING: 0.45,
  FLAT: 1,
};

/**
 * Gusseted bag (client [K] 30.09.2026): SHEET = 0, BOX = the formed open bag (0.6), STANDING = 0.75 (client [K]), FLAT
 * = folded flat (1).
 */
export const GUSSETED_TIMELINE_PRESETS: Readonly<Record<TimelineViewMode, number>> = {
  SHEET: 0,
  BOX: GUSSETED_TIMELINE_SHARE,
  STANDING: 0.75,
  FLAT: 1,
};

const PRESET_TOLERANCE = 1e-9;

const toSliderStep = (t: number) => Number((Math.round(t / TIMELINE_SLIDER_STEP) * TIMELINE_SLIDER_STEP).toFixed(2));

const stopsOf = (phaseStarts: readonly number[], presets: Readonly<Record<TimelineViewMode, number>>) =>
  [...new Set([...phaseStarts, ...Object.values(presets)].map(toSliderStep))].sort((a, b) => a - b);

/**
 * Block bottom chapter stops for the skip buttons (like a remote's previous / next chapter), ascending: the start of
 * every assembly phase (sheet 0, sides 16 %, front flap 24 %, back flap 32 %) and every 3D preset (formed 40 %, after
 * the fold 45 %, flat 100 %). On the 1 % slider grid.
 */
export const TIMELINE_STOPS: readonly number[] = stopsOf(
  Object.values(ASSEMBLY_PHASES).map(([start]) => start * ASSEMBLY_TIMELINE_SHARE),
  TIMELINE_PRESETS,
);

/**
 * Gusseted chapter stops: forming phase starts (sheet 0, BACK wrap 15 %, bottom 30 %, opening 45 %) and presets (open
 * bag 60 %, 75 %, flat 100 %).
 */
export const GUSSETED_TIMELINE_STOPS: readonly number[] = stopsOf(
  Object.values(GUSSETED_PHASES).map(([start]) => start * GUSSETED_TIMELINE_SHARE),
  GUSSETED_TIMELINE_PRESETS,
);

/**
 * Stage shown next to the slider. Block bottom: the flat sheet, an assembly phase (A, B, C1, C2), the formed open bag
 * (exactly the BOX preset) or the fold towards flat. Gusseted bag: the flat sheet, a forming phase (gussets, wrap +
 * seam, bottom, opening), then FORMED / FOLD like the block bottom.
 */
export type TimelinePhase =
  | 'SHEET'
  | AssemblyPhaseId
  | 'FORMED'
  | 'FOLD'
  | 'GUSSET_TUCK'
  | 'GUSSET_WRAP'
  | 'GUSSET_BOTTOM'
  | 'GUSSET_OPEN';

export type TimelineState = {
  /** Sheet → formed open bag, 0..1 (block: `assemblyKinematics.ts`, gusseted: `gussetedAssembly.ts`). */
  assemblyProgress: number;
  /** Formed open bag → folded flat, 0..1 (block: `foldKinematics.ts`, gusseted: `gussetedBag.ts`). */
  foldProgress: number;
  phase: TimelinePhase;
};

/** Derived view of a block-bottom timeline value (pure). */
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

const GUSSETED_PHASE_LABEL: Readonly<Record<GussetedPhaseId, TimelinePhase>> = {
  TUCK: 'GUSSET_TUCK',
  WRAP: 'GUSSET_WRAP',
  BOTTOM: 'GUSSET_BOTTOM',
  OPEN: 'GUSSET_OPEN',
};

/** Derived view of a gusseted timeline value (pure; `gussetedAssembly.ts`). */
export function getGussetedTimelineState(progress: number): TimelineState {
  const { assemblyProgress, foldProgress } = splitGussetedTimeline(progress);
  const phase: TimelinePhase =
    assemblyProgress <= 0
      ? 'SHEET'
      : assemblyProgress < 1
        ? GUSSETED_PHASE_LABEL[getGussetedPhase(assemblyProgress)]
        : foldProgress <= 0
          ? 'FORMED'
          : 'FOLD';
  return { assemblyProgress, foldProgress, phase };
}

type TimelineDefinition = {
  presets: Readonly<Record<TimelineViewMode, number>>;
  stops: readonly number[];
  state: (progress: number) => TimelineState;
};

/** The per-type timeline mapping: presets, chapter stops and the derived state (split + stage label). */
export const TIMELINE_DEFINITIONS: Readonly<Record<BagType, TimelineDefinition>> = {
  BLOCK: { presets: TIMELINE_PRESETS, stops: TIMELINE_STOPS, state: getTimelineState },
  FOLDED: { presets: GUSSETED_TIMELINE_PRESETS, stops: GUSSETED_TIMELINE_STOPS, state: getGussetedTimelineState },
};

const definitionOf = (productType: BagType | undefined) => TIMELINE_DEFINITIONS[productType ?? 'BLOCK'] ?? TIMELINE_DEFINITIONS.BLOCK;

/** Timeline value of every 3D preset for a bag type. */
export function getTimelinePresets(productType: BagType): Readonly<Record<TimelineViewMode, number>> {
  return definitionOf(productType).presets;
}

/** Chapter stops of a bag type's timeline (ascending, on the 1 % grid). */
export function getTimelineStops(productType: BagType): readonly number[] {
  return definitionOf(productType).stops;
}

/** The next stop after `progress` (direction 1) or the previous one before it (−1); null at the end. */
export function getTimelineStop(progress: number, direction: 1 | -1, productType: BagType = 'BLOCK'): number | null {
  const stops = getTimelineStops(productType);
  if (direction > 0) return stops.find((stop) => stop > progress + PRESET_TOLERANCE) ?? null;
  return [...stops].reverse().find((stop) => stop < progress - PRESET_TOLERANCE) ?? null;
}

/** The 3D preset that equals `progress` exactly (within float noise) for a bag type, or null. */
export function findTimelinePreset(progress: number, productType: BagType = 'BLOCK'): TimelineViewMode | null {
  const presets = getTimelinePresets(productType);
  const modes = Object.keys(presets) as TimelineViewMode[];
  return modes.find((m) => Math.abs(presets[m] - progress) < PRESET_TOLERANCE) ?? null;
}

/** `getTimelineState` for a bag type (its split, stage label and meaning of the progress values). */
export function getTimelineStateFor(productType: BagType, progress: number): TimelineState {
  return definitionOf(productType).state(progress);
}

type PreviewState = {
  /** Selected mode; null = 3D with a custom slider position that matches no preset. */
  viewMode: PreviewViewMode | null;
  /** The single 3D timeline value 0..1 (its meaning per bag type: `TIMELINE_DEFINITIONS`). */
  progress: number;
  /** Play button: the timeline advances by itself (see `tick`). */
  playing: boolean;
  /**
   * Selects a mode; 3D modes also move the timeline to their preset for the current bag type (the model animates
   * there) and stop playback.
   */
  setViewMode: (mode: PreviewViewMode) => void;
  /**
   * Timeline slider. Clamped to [0, 1]; NaN is ignored. Stops playback. In 3D, selects the preset it lands on exactly,
   * otherwise deselects the mode (null). In DIELINE only the stored progress changes.
   */
  setProgress: (progress: number) => void;
  /** Play / pause; playing from the end (1) restarts from the flat sheet (0). */
  togglePlaying: () => void;
  /** Jumps to the next (1) or previous (−1) chapter stop of the current bag type; stops playback. No-op at the ends. */
  skip: (direction: 1 | -1) => void;
  /** Advances a running playback by `deltaSeconds`; stops at 1. */
  tick: (deltaSeconds: number) => void;
  /**
   * The bag type changed (`productType` is the new one): a selected 3D preset keeps its meaning — the timeline moves
   * to that preset of the new type; a custom position stays and selects a preset it lands on exactly.
   */
  syncProductType: (productType: BagType) => void;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const currentProductType = (): BagType => useConfigurationStore.getState().configuration.productType;

/** Mode the preview starts in (and that a project without saved view state opens in). */
export const DEFAULT_PREVIEW_VIEW_MODE: TimelineViewMode = 'BOX';

export const usePreviewStore = create<PreviewState>((set, get) => ({
  viewMode: DEFAULT_PREVIEW_VIEW_MODE,
  progress: getTimelinePresets(currentProductType())[DEFAULT_PREVIEW_VIEW_MODE],
  playing: false,
  setViewMode: (mode) => {
    if (mode === 'DIELINE') set({ viewMode: mode, playing: false });
    else set({ viewMode: mode, progress: getTimelinePresets(currentProductType())[mode], playing: false });
  },
  setProgress: (progress) => {
    if (Number.isNaN(progress)) return;
    const p = clamp01(progress);
    if (get().viewMode === 'DIELINE') set({ progress: p, playing: false });
    else set({ progress: p, viewMode: findTimelinePreset(p, currentProductType()), playing: false });
  },
  togglePlaying: () => {
    const { playing, progress, viewMode } = get();
    if (playing) {
      set({ playing: false });
      return;
    }
    const start = progress >= 1 ? 0 : progress;
    set({
      playing: true,
      progress: start,
      viewMode: viewMode === 'DIELINE' ? viewMode : findTimelinePreset(start, currentProductType()),
    });
  },
  skip: (direction) => {
    const stop = getTimelineStop(get().progress, direction, currentProductType());
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
      viewMode: viewMode === 'DIELINE' ? viewMode : findTimelinePreset(next, currentProductType()),
    });
  },
  syncProductType: (productType) => {
    const { viewMode, progress } = get();
    if (viewMode !== null && viewMode !== 'DIELINE') {
      set({ progress: getTimelinePresets(productType)[viewMode] });
    } else if (viewMode === null) {
      set({ viewMode: findTimelinePreset(progress, productType) });
    }
  },
}));

// Keep the preview in step with the bag type (type switch, demo, project load): presets mean different timeline values
// per type. A project load restores its own saved view right after replacing the configuration (projectFile.ts).
useConfigurationStore.subscribe((state, previous) => {
  const type = state.configuration.productType;
  if (type !== previous.configuration.productType) usePreviewStore.getState().syncProductType(type);
});

export const is3DViewMode = (mode: PreviewViewMode | null): boolean => mode !== 'DIELINE';
