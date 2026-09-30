// Coverage / palette inputs from the resolved artwork of every wall: each layer's image decoded once as a pixel sample
// (cached per file), listed per wall bottom → top. Shared by the live estimate and the PDF / Excel export.

import type { ResolvedPanelArtworks } from '../../domain/artworkLayout';
import { PANEL_POSITIONS } from '../../domain/factories';
import type { CoveragePanelInput } from '../../domain/printCoverage';
import type { PanelPosition } from '../../domain/types';
import { loadArtworkSample } from '../artwork/sampleArtworkPixels';

export type CoverageInputs = {
  /** Per wall: the layers whose sample could be decoded, bottom → top. */
  panels: Record<PanelPosition, CoveragePanelInput[]>;
  /** Walls with at least one layer that could not be decoded (left out of the estimate). */
  unavailablePanels: PanelPosition[];
  /** File URLs in use (for pruning the sample cache). */
  usedUrls: Set<string>;
};

export async function loadCoverageInputs(artworks: ResolvedPanelArtworks): Promise<CoverageInputs> {
  const usedUrls = new Set<string>();
  const unavailablePanels: PanelPosition[] = [];
  const entries = await Promise.all(
    PANEL_POSITIONS.map(async (position) => {
      const layers = await Promise.all(
        artworks[position].layers.map(async ({ artwork, placement, area }): Promise<CoveragePanelInput | null> => {
          usedUrls.add(artwork.fileUrl);
          const sample = await loadArtworkSample(artwork);
          return sample ? { imageSize: { width: artwork.width, height: artwork.height }, placement, area, sample } : null;
        }),
      );
      if (layers.some((layer) => layer === null)) unavailablePanels.push(position);
      return [position, layers.filter((layer): layer is CoveragePanelInput => layer !== null)] as const;
    }),
  );
  return {
    panels: Object.fromEntries(entries) as Record<PanelPosition, CoveragePanelInput[]>,
    unavailablePanels: PANEL_POSITIONS.filter((position) => unavailablePanels.includes(position)),
    usedUrls,
  };
}
