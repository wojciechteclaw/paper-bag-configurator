// UI adapter: live ink-coverage estimate (docs/SPEC.md §4d). Samples each artwork once (cached), then recomputes
// the pure domain function after a debounce, in an idle callback, so typing / dragging never blocks the UI.
// Changing only the colour-analysis settings (merge tolerance, minimum share) recomputes the palette alone.

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolvePanelArtworks } from '../../domain/artworkLayout';
import { buildDieline } from '../../domain/dieline';
import { PANEL_POSITIONS } from '../../domain/factories';
import {
  computeArtworkPalette,
  computeInkCoverage,
  type ArtworkPaletteResult,
  type CoveragePanelInput,
  type InkCoverageResult,
} from '../../domain/printCoverage';
import type { PanelPosition } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';
import { loadArtworkSample, pruneArtworkSamples } from '../artwork/sampleArtworkPixels';

export const COVERAGE_DEBOUNCE_MS = 200;

export type InkCoverageState =
  | { status: 'empty' }
  | { status: 'computing'; result: InkCoverageResult | null; palette: ArtworkPaletteResult | null }
  | { status: 'ready'; result: InkCoverageResult; palette: ArtworkPaletteResult; unavailablePanels: PanelPosition[] };

type IdleHandle = { cancel: () => void };

function whenIdle(callback: () => void): IdleHandle {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(callback, { timeout: 500 });
    return { cancel: () => cancelIdleCallback(id) };
  }
  const id = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(id) };
}

type Computed = { request: object; result: InkCoverageResult; palette: ArtworkPaletteResult; unavailablePanels: PanelPosition[] };

export function useInkCoverage(): InkCoverageState {
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const panels = useConfigurationStore((s) => s.configuration.panels);
  const artworkLayout = useConfigurationStore((s) => s.configuration.artworkLayout);
  const wrapArtwork = useConfigurationStore((s) => s.configuration.wrapArtwork);
  const paperColor = useConfigurationStore((s) => s.configuration.paper.color);
  const pantoneColors = useConfigurationStore((s) => s.configuration.print.pantoneColors);
  const colorAnalysis = useConfigurationStore((s) => s.configuration.print.colorAnalysis);
  // What every wall shows under the active layout (per wall, or the whole-bag wrap — docs/SPEC.md §3a).
  const artworks = useMemo(
    () => resolvePanelArtworks({ dimensions, panels, artworkLayout, wrapArtwork }),
    [dimensions, panels, artworkLayout, wrapArtwork],
  );
  const hasArtwork = PANEL_POSITIONS.some((position) => artworks[position].artwork);
  // Identity of the current inputs: a result is "ready" only for the request it was computed from.
  const coverageRequest = useMemo(
    () => ({ dieline: buildDieline({ dimensions, handle }), artworks, paperColor, pantoneColors }),
    [dimensions, handle, artworks, paperColor, pantoneColors],
  );
  const request = useMemo(() => ({ coverageRequest, colorAnalysis }), [coverageRequest, colorAnalysis]);
  const [computed, setComputed] = useState<Computed | null>(null);
  // Last coverage result and the coverage inputs it belongs to (reused when only the colour analysis changed).
  const lastCoverage = useRef<{ request: object; result: InkCoverageResult } | null>(null);

  useEffect(() => {
    if (!hasArtwork) return;
    let active = true;
    let idle: IdleHandle | null = null;
    const { coverageRequest: inputs } = request;

    const timer = setTimeout(async () => {
      const used = new Set<string>();
      const entries = await Promise.all(
        PANEL_POSITIONS.map(async (position) => {
          const { artwork, placement, area } = inputs.artworks[position];
          if (!artwork) return [position, null] as const;
          used.add(artwork.fileUrl);
          const sample = await loadArtworkSample(artwork);
          const input: CoveragePanelInput | null = sample
            ? { imageSize: { width: artwork.width, height: artwork.height }, placement, area, sample }
            : null;
          return [position, input] as const;
        }),
      );
      if (!active) return;
      pruneArtworkSamples(used);
      idle = whenIdle(() => {
        if (!active) return;
        const samples = Object.fromEntries(entries) as Record<PanelPosition, CoveragePanelInput | null>;
        const analysisInput = {
          dieline: inputs.dieline,
          panels: samples,
          paperColor: inputs.paperColor,
          pantoneColors: inputs.pantoneColors,
        };
        const result =
          lastCoverage.current?.request === inputs ? lastCoverage.current.result : computeInkCoverage(analysisInput);
        lastCoverage.current = { request: inputs, result };
        const palette = computeArtworkPalette({ ...analysisInput, colorAnalysis: request.colorAnalysis });
        const unavailablePanels = PANEL_POSITIONS.filter((p) => inputs.artworks[p].artwork && !samples[p]);
        setComputed({ request, result, palette, unavailablePanels });
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
    return { status: 'ready', result: computed.result, palette: computed.palette, unavailablePanels: computed.unavailablePanels };
  }
  return { status: 'computing', result: computed?.result ?? null, palette: computed?.palette ?? null };
}
