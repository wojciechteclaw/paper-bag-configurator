// UI orchestration of the configuration export (docs/SPEC.md §4e): PDF product sheet and Excel workbook.
// Loaded lazily from the Summary step; pulls jsPDF / svg2pdf / exceljs / the offscreen renderer only on demand.
// Everything is computed from the BagConfiguration passed in (no store reads here).

import { buildDieline, type Dieline } from '../../domain/dieline';
import { PANEL_POSITIONS } from '../../domain/factories';
import {
  computeArtworkPalette,
  computeInkCoverage,
  type ArtworkPaletteResult,
  type CoveragePanelInput,
  type InkCoverageResult,
} from '../../domain/printCoverage';
import type { BagConfiguration, PanelPosition } from '../../domain/types';
import { buildDielineScene } from '../../dieline/scene';
import { downloadBlob } from '../../dieline/exportSvg';
import type { ExportContext } from '../../export/format';
import { buildProductSheetData } from '../../export/productSheetData';
import { buildWorkbookModel } from '../../export/workbookModel';
import { loadArtworkSample } from '../artwork/sampleArtworkPixels';

export type ExportProgress =
  | { phase: 'coverage' }
  | { phase: 'views'; done: number; total: number }
  | { phase: 'document' };

export type ProgressCallback = (progress: ExportProgress) => void;

/** Ink coverage and colour palette of the current artwork (same inputs as the live estimate in the Artwork step). */
export type PrintAnalysis = { coverage: InkCoverageResult; palette: ArtworkPaletteResult };

/** 3D snapshots of the product sheet: JPEG, sized for a ~87 mm wide cell at ~290 dpi. */
export const PDF_SNAPSHOT_OPTIONS = { width: 1000, height: 750, mimeType: 'image/jpeg', quality: 0.85 } as const;

export async function computePrintAnalysisForExport(configuration: BagConfiguration, dieline: Dieline): Promise<PrintAnalysis> {
  const entries = await Promise.all(
    PANEL_POSITIONS.map(async (position) => {
      const { artwork, placement } = configuration.panels[position];
      if (!artwork) return [position, null] as const;
      const sample = await loadArtworkSample(artwork);
      const input: CoveragePanelInput | null = sample
        ? { imageSize: { width: artwork.width, height: artwork.height }, placement, sample }
        : null;
      return [position, input] as const;
    }),
  );
  const input = {
    dieline,
    panels: Object.fromEntries(entries) as Record<PanelPosition, CoveragePanelInput | null>,
    paperColor: configuration.paper.color,
    pantoneColors: configuration.print.pantoneColors,
  };
  return {
    coverage: computeInkCoverage(input),
    palette: computeArtworkPalette({ ...input, colorAnalysis: configuration.print.colorAnalysis }),
  };
}

async function analysisOrNull(configuration: BagConfiguration, dieline: Dieline): Promise<PrintAnalysis | null> {
  try {
    return await computePrintAnalysisForExport(configuration, dieline);
  } catch (error) {
    console.warn('Ink coverage could not be computed for the export', error);
    return null;
  }
}

export async function exportProductSheetPdf(
  configuration: BagConfiguration,
  context: ExportContext,
  onProgress?: ProgressCallback,
): Promise<void> {
  const { t } = context;
  onProgress?.({ phase: 'coverage' });
  const dieline = buildDieline(configuration);
  const analysis = await analysisOrNull(configuration, dieline);
  const data = buildProductSheetData(configuration, analysis?.coverage ?? null, dieline, context, analysis?.palette ?? null);

  const views = data.viewPages.flatMap((page) => page.views);
  onProgress?.({ phase: 'views', done: 0, total: views.length });
  const snapshots: Record<string, string> = {};
  try {
    const { renderBagSnapshots } = await import('../../renderer/snapshot');
    const images = await renderBagSnapshots(configuration, views, {
      ...PDF_SNAPSHOT_OPTIONS,
      onProgress: (done, total) => onProgress?.({ phase: 'views', done, total }),
    });
    views.forEach((view, i) => {
      snapshots[view.id] = images[i];
    });
  } catch (error) {
    // No WebGL (or a lost context): the sheet is still useful without the 3D pages' images.
    console.warn('3D views could not be rendered for the product sheet', error);
  }

  onProgress?.({ phase: 'document' });
  const scene = buildDielineScene(dieline, configuration.panels, {
    label: (key) => t(`dieline.label.${key}`),
    dimension: (key, value) => t(`dieline.dimension.${key}`, { value: Math.round(value * 10) / 10 }),
  });
  const { buildProductSheetPdf } = await import('../../export/generateProductSheetPdf');
  const blob = await buildProductSheetPdf({ data, scene, snapshots, context, paperColor: configuration.paper.color });
  downloadBlob(blob, `${data.fileBaseName}.pdf`);
}

export async function exportWorkbook(
  configuration: BagConfiguration,
  context: ExportContext,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.({ phase: 'coverage' });
  const dieline = buildDieline(configuration);
  const analysis = await analysisOrNull(configuration, dieline);
  const model = buildWorkbookModel(configuration, analysis?.coverage ?? null, dieline, context, analysis?.palette ?? null);
  onProgress?.({ phase: 'document' });
  const { buildXlsxBuffer, XLSX_MIME } = await import('../../export/generateXlsx');
  const buffer = await buildXlsxBuffer(model);
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${model.fileBaseName}.xlsx`);
}
