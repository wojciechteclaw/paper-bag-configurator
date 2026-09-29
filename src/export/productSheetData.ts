// PDF product sheet (docs/SPEC.md §4e) as pure, localized data: the PDF adapter only lays it out.
// No quantity anywhere — it is a pricing parameter, not part of the configuration.

import { ARTWORK_PALETTE_RULES } from '../domain/config/productCatalog';
import type { Dieline } from '../domain/dieline';
import type { ArtworkPaletteResult, InkCoverageResult } from '../domain/printCoverage';
import type { BagConfiguration } from '../domain/types';
import { exportFileBaseName, formatNumber, formatPercent, type ExportContext } from './format';
import { buildParameterSections, type ParameterSection } from './parameters';

/** Camera angle of a 3D snapshot (same ids as the renderer's `SnapshotAngle`). */
export type SnapshotAngleId = 'FRONT_3_4' | 'BACK_3_4' | 'LEFT_3_4' | 'RIGHT_3_4' | 'FRONT' | 'BACK';

export type ProductSheetView = {
  id: string;
  foldProgress: number;
  angle: SnapshotAngleId;
  caption: string;
};

export type ProductSheetViewPage = { id: 'unfolded' | 'folded'; title: string; note?: string; views: ProductSheetView[] };

export type ArtworkColorTableRow = {
  hex: string;
  /** "PMS 186 C (ΔE 1,2)", or "—" without a Pantone list. */
  pantone: string;
  /** Formatted area, cm². */
  area: string;
  /** Formatted share of the sheet. */
  percent: string;
};

export type ArtworkColorTable = {
  title: string;
  headers: { swatch: string; hex: string; pantone: string; area: string; percent: string };
  rows: ArtworkColorTableRow[];
  /** Present when minor shades were grouped as "other". */
  other?: { label: string; area: string; percent: string };
  total: { label: string; area: string; percent: string };
  notes: string[];
};

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
  /** Colours detected in the placed artwork (HEX) with their area. */
  artworkColors: ArtworkColorTable;
  viewPages: ProductSheetViewPage[];
};

/**
 * 3D views of the sheet (client request 29.09.2026): the unfolded bag (p = 0) from all four 3/4 angles, so every wall
 * is visible, then the folded bag: 20 % folded front / back 3/4 and 100 % folded (flat) front / back.
 */
export const PRODUCT_SHEET_VIEWS: readonly { page: ProductSheetViewPage['id']; foldProgress: number; angle: SnapshotAngleId }[] = [
  { page: 'unfolded', foldProgress: 0, angle: 'FRONT_3_4' },
  { page: 'unfolded', foldProgress: 0, angle: 'BACK_3_4' },
  { page: 'unfolded', foldProgress: 0, angle: 'LEFT_3_4' },
  { page: 'unfolded', foldProgress: 0, angle: 'RIGHT_3_4' },
  { page: 'folded', foldProgress: 0.2, angle: 'FRONT_3_4' },
  { page: 'folded', foldProgress: 0.2, angle: 'BACK_3_4' },
  { page: 'folded', foldProgress: 1, angle: 'FRONT' },
  { page: 'folded', foldProgress: 1, angle: 'BACK' },
];

/**
 * Notes under the artwork-colour table (PDF and Excel): the method with the merge settings actually used
 * (`PrintSpec.colorAnalysis`) and how many raw shades were merged into how many colours.
 */
export function artworkPaletteNotes(palette: ArtworkPaletteResult, { t, language }: ExportContext): string[] {
  const minShare = new Intl.NumberFormat(language.startsWith('pl') ? 'pl-PL' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(palette.settings.minAreaShare);
  return [
    t('coverage.palette.note', {
      tolerance: formatNumber(palette.settings.mergeTolerance, language, 1),
      minShare,
      max: ARTWORK_PALETTE_RULES.maxColors,
    }),
    t('coverage.analysis.merged', {
      count: palette.colors.length,
      shades: t('coverage.analysis.shades', { count: palette.rawColorCount }),
    }),
  ];
}

/** Table of the colours detected in the artwork (HEX, nearest Pantone, area, % of sheet), largest first. */
export function buildArtworkColorTable(palette: ArtworkPaletteResult | null, context: ExportContext): ArtworkColorTable {
  const { t, language } = context;
  const cm2 = t('export.unit.cm2');
  const area = (mm2: number) => `${formatNumber(mm2 / 100, language, 1)} ${cm2}`;
  const pct = (ratio: number) => formatPercent(ratio, language, 2);
  const dash = '—';
  const rows: ArtworkColorTableRow[] = (palette?.colors ?? []).map((color) => ({
    hex: color.hex,
    pantone: color.pantone ? `${color.pantone.code} (ΔE ${formatNumber(color.pantone.deltaE, language, 1)})` : dash,
    area: area(color.area),
    percent: pct(color.sheetRatio),
  }));
  const notes: string[] = [];
  if (!palette) notes.push(t('export.artworkColors.none'));
  else if (palette.colors.length === 0) notes.push(t('export.artworkColors.empty'));
  else notes.push(...artworkPaletteNotes(palette, context));
  return {
    title: t('export.artworkColors.title'),
    headers: {
      swatch: t('export.artworkColors.swatch'),
      hex: t('export.artworkColors.hex'),
      pantone: t('export.artworkColors.pantone'),
      area: t('export.artworkColors.area', { unit: cm2 }),
      percent: t('export.artworkColors.percent'),
    },
    rows,
    ...(palette && palette.other.area > 0
      ? {
          other: {
            label: t('coverage.palette.other', { count: palette.other.colorCount }),
            area: area(palette.other.area),
            percent: pct(palette.other.sheetRatio),
          },
        }
      : {}),
    total: {
      label: t('coverage.total'),
      area: palette ? area(palette.inkArea) : dash,
      percent: palette ? pct(palette.sheetRatio) : dash,
    },
    notes,
  };
}

export function buildProductSheetData(
  configuration: BagConfiguration,
  coverage: InkCoverageResult | null,
  dieline: Dieline,
  context: ExportContext,
  palette: ArtworkPaletteResult | null = null,
): ProductSheetData {
  const { t, language } = context;
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

  const viewPages: ProductSheetViewPage[] = (['unfolded', 'folded'] as const).map((page) => ({
    id: page,
    title: t(`export.views.${page}.title`),
    note: t(`export.views.${page}.note`),
    views: PRODUCT_SHEET_VIEWS.filter((v) => v.page === page).map((v, i) => ({
      id: `${page}-${i + 1}`,
      foldProgress: v.foldProgress,
      angle: v.angle,
      caption: t('export.views.caption', {
        angle: t(`export.views.angle.${v.angle}`),
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
    artworkColors: buildArtworkColorTable(palette, context),
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
