import { create } from 'zustand';

// View state of the 3D preview. Deliberately NOT part of BagConfiguration (docs/SPEC.md §4a).
type PreviewState = {
  /** 0 = bag open, 1 = folded flat. */
  foldProgress: number;
  /** Clamped to [0, 1]; NaN is ignored. */
  setFoldProgress: (foldProgress: number) => void;
};

export const usePreviewStore = create<PreviewState>((set) => ({
  foldProgress: 0,
  setFoldProgress: (foldProgress) => {
    if (Number.isNaN(foldProgress)) return;
    set({ foldProgress: Math.min(1, Math.max(0, foldProgress)) });
  },
}));
