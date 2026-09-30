import { create } from 'zustand';
import type { ArtworkTarget } from '../domain/types';

// View state of the configurator (which step is open, which artwork is selected for editing). Deliberately NOT part of
// BagConfiguration.
export const CONFIGURATOR_STEPS = ['typeAndDimensions', 'paperAndHandle', 'artwork', 'production', 'summary'] as const;

export type ConfiguratorStep = (typeof CONFIGURATOR_STEPS)[number];

type ConfiguratorUiState = {
  step: ConfiguratorStep;
  setStep: (step: ConfiguratorStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  /**
   * Artwork selected for editing (a wall, or a whole-bag layer `WRAP:<id>`), shared by the dieline editor and the
   * layer list of the Graphics step. May point at artwork that no longer exists or belongs to the inactive layout —
   * readers ignore such a selection (`getActiveArtworkTargets`).
   */
  selectedArtwork: ArtworkTarget | null;
  selectArtwork: (target: ArtworkTarget | null) => void;
};

const shift = (step: ConfiguratorStep, delta: number): ConfiguratorStep => {
  const index = CONFIGURATOR_STEPS.indexOf(step) + delta;
  return CONFIGURATOR_STEPS[Math.min(CONFIGURATOR_STEPS.length - 1, Math.max(0, index))];
};

export const useConfiguratorUiStore = create<ConfiguratorUiState>((set) => ({
  step: CONFIGURATOR_STEPS[0],
  setStep: (step) => set({ step }),
  nextStep: () => set(({ step }) => ({ step: shift(step, 1) })),
  previousStep: () => set(({ step }) => ({ step: shift(step, -1) })),
  selectedArtwork: null,
  selectArtwork: (target) => set({ selectedArtwork: target }),
}));
