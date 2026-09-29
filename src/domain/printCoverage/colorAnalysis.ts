// Settings of the artwork colour analysis ("Łączenie podobnych kolorów", docs/SPEC.md §4d). Pure TS.

import { COLOR_ANALYSIS_DEFAULTS, COLOR_ANALYSIS_LIMITS } from '../config/productCatalog';
import type { ColorAnalysisSettings } from '../types';

const clampOr = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/**
 * Valid settings from anything stored (older configurations have none → catalog defaults): tolerance clamped to
 * `COLOR_ANALYSIS_LIMITS` and rounded to 0.1 ΔE00, minimum share clamped to its range.
 */
export function normalizeColorAnalysis(value?: Partial<ColorAnalysisSettings> | null): ColorAnalysisSettings {
  const { mergeTolerance, minAreaShare } = COLOR_ANALYSIS_LIMITS;
  return {
    mergeTolerance:
      Math.round(clampOr(value?.mergeTolerance, COLOR_ANALYSIS_DEFAULTS.mergeTolerance, mergeTolerance.min, mergeTolerance.max) * 10) /
      10,
    minAreaShare: clampOr(value?.minAreaShare, COLOR_ANALYSIS_DEFAULTS.minAreaShare, minAreaShare.min, minAreaShare.max),
  };
}
