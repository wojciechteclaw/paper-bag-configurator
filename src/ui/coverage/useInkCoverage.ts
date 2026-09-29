// UI adapter: live ink-coverage estimate (docs/SPEC.md §4d). Samples each artwork once (cached), then recomputes
// the pure domain function after a debounce, in an idle callback, so typing / dragging never blocks the UI.

import { useEffect, useMemo, useState } from 'react';
import { buildDieline } from '../../domain/dieline';
import { PANEL_POSITIONS } from '../../domain/factories';
import { computeInkCoverage, type CoveragePanelInput, type InkCoverageResult } from '../../domain/printCoverage';
import type { PanelPosition } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';
import { loadArtworkSample, pruneArtworkSamples } from '../artwork/sampleArtworkPixels';

export const COVERAGE_DEBOUNCE_MS = 200;

export type InkCoverageState =
  | { status: 'empty' }
  | { status: 'computing'; result: InkCoverageResult | null }
  | { status: 'ready'; result: InkCoverageResult; unavailablePanels: PanelPosition[] };

type IdleHandle = { cancel: () => void };

function whenIdle(callback: () => void): IdleHandle {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(callback, { timeout: 500 });
    return { cancel: () => cancelIdleCallback(id) };
  }
  const id = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(id) };
}

type Computed = { request: object; result: InkCoverageResult; unavailablePanels: PanelPosition[] };

export function useInkCoverage(): InkCoverageState {
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const panels = useConfigurationStore((s) => s.configuration.panels);
  const paperColor = useConfigurationStore((s) => s.configuration.paper.color);
  const pantoneColors = useConfigurationStore((s) => s.configuration.print.pantoneColors);
  const hasArtwork = PANEL_POSITIONS.some((position) => panels[position].artwork);
  // Identity of the current inputs: a result is "ready" only for the request it was computed from.
  const request = useMemo(
    () => ({ dieline: buildDieline({ dimensions, handle }), panels, paperColor, pantoneColors }),
    [dimensions, handle, panels, paperColor, pantoneColors],
  );
  const [computed, setComputed] = useState<Computed | null>(null);

  useEffect(() => {
    if (!hasArtwork) return;
    let active = true;
    let idle: IdleHandle | null = null;

    const timer = setTimeout(async () => {
      const used = new Set<string>();
      const entries = await Promise.all(
        PANEL_POSITIONS.map(async (position) => {
          const { artwork, placement } = request.panels[position];
          if (!artwork) return [position, null] as const;
          used.add(artwork.fileUrl);
          const sample = await loadArtworkSample(artwork);
          const input: CoveragePanelInput | null = sample
            ? { imageSize: { width: artwork.width, height: artwork.height }, placement, sample }
            : null;
          return [position, input] as const;
        }),
      );
      if (!active) return;
      pruneArtworkSamples(used);
      idle = whenIdle(() => {
        if (!active) return;
        const inputs = Object.fromEntries(entries) as Record<PanelPosition, CoveragePanelInput | null>;
        const result = computeInkCoverage({
          dieline: request.dieline,
          panels: inputs,
          paperColor: request.paperColor,
          pantoneColors: request.pantoneColors,
        });
        const unavailablePanels = PANEL_POSITIONS.filter((p) => request.panels[p].artwork && !inputs[p]);
        setComputed({ request, result, unavailablePanels });
      });
    }, COVERAGE_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      idle?.cancel();
    };
  }, [hasArtwork, request]);

  if (!hasArtwork) return { status: 'empty' };
  if (computed?.request === request) {
    return { status: 'ready', result: computed.result, unavailablePanels: computed.unavailablePanels };
  }
  return { status: 'computing', result: computed?.result ?? null };
}
