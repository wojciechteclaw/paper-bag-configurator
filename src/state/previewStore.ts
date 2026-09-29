import { create } from 'zustand';
import { getStandingFoldProgress } from '../domain/geometry/foldKinematics';

// View state of the preview (docs/SPEC.md §4a, §4c). Deliberately NOT part of BagConfiguration.

/** Preview modes: 2D dieline, open box (p = 0), naturally standing bag, folded flat (p = 1). */
export type PreviewViewMode = 'DIELINE' | 'BOX' | 'STANDING' | 'FLAT';
export type FoldViewMode = Exclude<PreviewViewMode, 'DIELINE'>;

export const PREVIEW_VIEW_MODES: readonly PreviewViewMode[] = ['DIELINE', 'BOX', 'STANDING', 'FLAT'];

/** Resolution of the fold slider (1 %); presets are rounded to it so the slider can land on them exactly. */
export const FOLD_SLIDER_STEP = 0.01;

const toSliderStep = (p: number) => Math.round(p / FOLD_SLIDER_STEP) / (1 / FOLD_SLIDER_STEP);

/**
 * Fold progress of each 3D mode. STANDING = the p at which the side's bottom triangle is inclined 45° from the
 * vertical (`getStandingFoldProgress`, ≈ 0.2497), rounded to the slider step → 0.25.
 */
export const FOLD_PRESETS: Readonly<Record<FoldViewMode, number>> = {
  BOX: 0,
  STANDING: toSliderStep(getStandingFoldProgress()),
  FLAT: 1,
};

const PRESET_TOLERANCE = 1e-9;

/** The 3D mode whose preset equals `foldProgress` exactly (within float noise), or null. */
export function findFoldPreset(foldProgress: number): FoldViewMode | null {
  const modes = Object.keys(FOLD_PRESETS) as FoldViewMode[];
  return modes.find((m) => Math.abs(FOLD_PRESETS[m] - foldProgress) < PRESET_TOLERANCE) ?? null;
}

type PreviewState = {
  /** Selected mode; null = 3D with a custom slider position that matches no preset. */
  viewMode: PreviewViewMode | null;
  /** 0 = bag open, 1 = folded flat. The 3D model animates towards it. */
  foldProgress: number;
  /** Selects a mode; 3D modes also set foldProgress to their preset (the model animates there). */
  setViewMode: (mode: PreviewViewMode) => void;
  /**
   * Fold slider. Clamped to [0, 1]; NaN is ignored. In 3D, selects the preset mode it lands on exactly, otherwise
   * deselects the mode (null). In DIELINE only the stored progress changes.
   */
  setFoldProgress: (foldProgress: number) => void;
};

export const usePreviewStore = create<PreviewState>((set, get) => ({
  viewMode: 'BOX',
  foldProgress: FOLD_PRESETS.BOX,
  setViewMode: (mode) => {
    if (mode === 'DIELINE') set({ viewMode: mode });
    else set({ viewMode: mode, foldProgress: FOLD_PRESETS[mode] });
  },
  setFoldProgress: (foldProgress) => {
    if (Number.isNaN(foldProgress)) return;
    const p = Math.min(1, Math.max(0, foldProgress));
    if (get().viewMode === 'DIELINE') set({ foldProgress: p });
    else set({ foldProgress: p, viewMode: findFoldPreset(p) });
  },
}));

export const is3DViewMode = (mode: PreviewViewMode | null): boolean => mode !== 'DIELINE';
