// UI adapter: live ink-coverage estimate (docs/SPEC.md §4d). Samples each artwork once (cached), then recomputes
// the pure domain function after a debounce, in an idle callback, so typing / dragging never blocks the UI.
// Changing only the colour-analysis settings (merge tolerance, minimum share) recomputes the palette alone.

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolvePanelArtworks } from '../../domain/artworkLayout';
import { buildDieline } from '../../domain/dieline';
import { getGlueFlapWidth } from '../../domain/glueFlap';
import { getConfiguredBottomFold } from '../../domain/bottomFold';
import { getWindow } from '../../domain/window';
import { PANEL_POSITIONS } from '../../domain/factories';
import {
  computeArtworkPalette,
  computeInkCoverage,
  type ArtworkPaletteResult,
  type InkCoverageResult,
} from '../../domain/printCoverage';
import type { PanelPosition } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';
import { pruneArtworkSamples } from '../artwork/sampleArtworkPixels';
import { loadCoverageInputs } from './coverageInputs';

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
  const glueFlapWidth = useConfigurationStore((s) => getGlueFlapWidth(s.configuration));
  const bottomFoldDepth = useConfigurationStore((s) => getConfiguredBottomFold(s.configuration));
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const bagWindow = useConfigurationStore((s) => getWindow(s.configuration));
  const panels = useConfigurationStore((s) => s.configuration.panels);
  const artworkLayout = useConfigurationStore((s) => s.configuration.artworkLayout);
  const wrapLayers = useConfigurationStore((s) => s.configuration.wrapLayers);
  const sheetLayers = useConfigurationStore((s) => s.configuration.sheetLayers);
  const paperColor = useConfigurationStore((s) => s.configuration.paper.color);
  const pantoneColors = useConfigurationStore((s) => s.configuration.print.pantoneColors);
  const colorAnalysis = useConfigurationStore((s) => s.configuration.print.colorAnalysis);
  // What every wall shows under the active layout (per wall, whole-bag or whole-sheet layers — docs/SPEC.md §3a–§3c).
  const artworks = useMemo(
    () =>
      resolvePanelArtworks({ dimensions, panels, artworkLayout, wrapLayers, sheetLayers, productType, glueFlapWidth, bottomFoldDepth }),
    [dimensions, panels, artworkLayout, wrapLayers, sheetLayers, productType, glueFlapWidth, bottomFoldDepth],
  );
  const hasArtwork = PANEL_POSITIONS.some((position) => artworks[position].layers.length > 0);
  // Identity of the current inputs: a result is "ready" only for the request it was computed from.
  const coverageRequest = useMemo(
    () => ({
      dieline: buildDieline({ dimensions, handle, glueFlapWidth, productType, bottomFoldDepth, window: bagWindow }),
      artworks,
      paperColor,
      pantoneColors,
    }),
    [dimensions, handle, glueFlapWidth, productType, bottomFoldDepth, bagWindow, artworks, paperColor, pantoneColors],
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
      const loaded = await loadCoverageInputs(inputs.artworks);
      if (!active) return;
      pruneArtworkSamples(loaded.usedUrls);
      idle = whenIdle(() => {
        if (!active) return;
        const analysisInput = {
          dieline: inputs.dieline,
          panels: loaded.panels,
          paperColor: inputs.paperColor,
          pantoneColors: inputs.pantoneColors,
        };
        const result =
          lastCoverage.current?.request === inputs ? lastCoverage.current.result : computeInkCoverage(analysisInput);
        lastCoverage.current = { request: inputs, result };
        const palette = computeArtworkPalette({ ...analysisInput, colorAnalysis: request.colorAnalysis });
        setComputed({ request, result, palette, unavailablePanels: loaded.unavailablePanels });
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
