import { create } from 'zustand';

// View state of the configurator (which step is open). Deliberately NOT part of BagConfiguration.
export const CONFIGURATOR_STEPS = ['typeAndDimensions', 'paperAndHandle', 'artwork', 'production', 'summary'] as const;

export type ConfiguratorStep = (typeof CONFIGURATOR_STEPS)[number];

type ConfiguratorUiState = {
  step: ConfiguratorStep;
  setStep: (step: ConfiguratorStep) => void;
  nextStep: () => void;
  previousStep: () => void;
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
}));
