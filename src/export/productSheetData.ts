// PDF product sheet (docs/SPEC.md §4e) as pure, localized data: the PDF adapter only lays it out.
// No quantity anywhere — it is a pricing parameter, not part of the configuration.

import type { Dieline } from '../domain/dieline';
import type { InkCoverageResult } from '../domain/printCoverage';
import type { BagConfiguration } from '../domain/types';
import { exportFileBaseName, formatNumber, formatPercent, type ExportContext } from './format';
import { buildParameterSections, type ParameterSection } from './parameters';

export type SnapshotAngleId = 'FRONT_3_4' | 'BACK_3_4';

export type ProductSheetView = {
  id: string;
  foldProgress: number;
  angle: SnapshotAngleId;
  caption: string;
};

export type ProductSheetViewPage = { id: 'views' | 'folding'; title: string; note?: string; views: ProductSheetView[] };

export type PantoneTableRow = {
  code: string;
  hex: string;
  /** Formatted share of the sheet, or "—" when coverage is unknown. */
  percent: string;
  /** Formatted area, cm². */
  area: string;
};

export type ProductSheetData = {
  fileBaseName: string;
  title: string;
  subtitle: string;
  /** Page footer text (configuration id). */
  footer: string;
  parameters: { title: string; sections: ParameterSection[] };
  pantone: {
    title: string;
    headers: { color: string; code: string; percent: string; area: string };
    rows: PantoneTableRow[];
    total: { label: string; percent: string; area: string };
    /** Present only when ink was not assigned to any Pantone. */
    unassigned?: { label: string; percent: string; area: string };
    notes: string[];
  };
  dieline: {
    title: string;
    /** Scale note is formatted by the adapter via `formatScaleNote` once the fit is known. */
    legend: { cut: string; crease: string; patch: string };
    svgTitle: string;
  };
  viewPages: ProductSheetViewPage[];
};

/** 3D views of the sheet: full box and standing bag from both 3/4 angles, then the folding options. */
export const PRODUCT_SHEET_VIEWS: readonly { page: ProductSheetViewPage['id']; foldProgress: number; angle: SnapshotAngleId; key: string }[] = [
  { page: 'views', foldProgress: 0, angle: 'FRONT_3_4', key: 'box' },
  { page: 'views', foldProgress: 0, angle: 'BACK_3_4', key: 'box' },
  { page: 'views', foldProgress: 0.25, angle: 'FRONT_3_4', key: 'standing' },
  { page: 'views', foldProgress: 0.25, angle: 'BACK_3_4', key: 'standing' },
  { page: 'folding', foldProgress: 0.5, angle: 'FRONT_3_4', key: 'stage' },
  { page: 'folding', foldProgress: 0.75, angle: 'FRONT_3_4', key: 'stage' },
  { page: 'folding', foldProgress: 1, angle: 'FRONT_3_4', key: 'flat' },
  { page: 'folding', foldProgress: 1, angle: 'BACK_3_4', key: 'flat' },
];

export function buildProductSheetData(
  configuration: BagConfiguration,
  coverage: InkCoverageResult | null,
  dieline: Dieline,
  { t, language }: ExportContext,
): ProductSheetData {
  const { dimensions, print } = configuration;
  const cm2 = t('export.unit.cm2');
  const dash = '—';
  const pct = (ratio: number | undefined) => (coverage && ratio !== undefined ? formatPercent(ratio, language, 2) : dash);
  const area = (mm2: number | undefined) =>
    coverage && mm2 !== undefined ? `${formatNumber(mm2 / 100, language, 1)} ${cm2}` : dash;

  const rows: PantoneTableRow[] = print.pantoneColors.map((color, i) => {
    const c = coverage?.colors[i];
    return { code: color.code, hex: color.hex, percent: pct(c?.sheetRatio), area: area(c?.area) };
  });

  const notes: string[] = [];
  if (!coverage) notes.push(t('export.coverage.none'));
  else notes.push(t('coverage.estimateNote'));
  if (print.pantoneColors.length === 0) notes.push(t('export.coverage.noColors'));

  const angleLabel = (angle: SnapshotAngleId) => t(`export.views.angle.${angle}`);
  const viewPages: ProductSheetViewPage[] = (['views', 'folding'] as const).map((page) => ({
    id: page,
    title: t(`export.views.${page}.title`),
    note: t(`export.views.${page}.note`),
    views: PRODUCT_SHEET_VIEWS.filter((v) => v.page === page).map((v, i) => ({
      id: `${page}-${i + 1}`,
      foldProgress: v.foldProgress,
      angle: v.angle,
      caption: t(`export.views.caption.${v.key}`, {
        angle: angleLabel(v.angle),
        fold: formatPercent(v.foldProgress, language, 0),
      }),
    })),
  }));

  return {
    fileBaseName: exportFileBaseName(configuration, t),
    title: t('export.pdf.title'),
    subtitle: t('export.pdf.subtitle', {
      type: t(`productType.${configuration.productType}`),
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
    }),
    footer: t('export.pdf.footer', { id: configuration.id.slice(0, 8) }),
    parameters: { title: t('export.pdf.parameters'), sections: buildParameterSections(configuration, dieline, t) },
    pantone: {
      title: t('export.pantone.title'),
      headers: {
        color: t('export.pantone.swatch'),
        code: t('export.pantone.code'),
        percent: t('export.pantone.percent'),
        area: t('export.pantone.area', { unit: cm2 }),
      },
      rows,
      total: { label: t('coverage.total'), percent: pct(coverage?.sheetRatio), area: area(coverage?.inkArea) },
      ...(coverage && coverage.unassignedArea > 0
        ? {
            unassigned: {
              label: t('coverage.unassigned'),
              percent: pct(coverage.unassignedSheetRatio),
              area: area(coverage.unassignedArea),
            },
          }
        : {}),
      notes,
    },
    dieline: {
      title: t('export.dieline.title'),
      legend: { cut: t('dieline.legend.cut'), crease: t('dieline.legend.crease'), patch: t('dieline.legend.patch') },
      svgTitle: t('dieline.svgTitle', dimensions),
    },
    viewPages,
  };
}

export type Fit = { width: number; height: number; scale: number };

/** Largest size of a `w × h` mm drawing inside a `maxW × maxH` mm box; `scale` = drawing mm per real mm (≤ 1). */
export function fitToBox(w: number, h: number, maxW: number, maxH: number): Fit {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: w * scale, height: h * scale, scale };
}

/** "Skala 1:3,4 — wymiary w mm" style note. */
export function formatScaleNote(scale: number, { t, language }: ExportContext): string {
  return t('export.dieline.scale', { ratio: formatNumber(1 / scale, language, 1) });
}
