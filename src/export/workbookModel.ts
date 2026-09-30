// Excel export (docs/SPEC.md §4e) as a pure, localized table model; the exceljs adapter only writes it.
// Sheets: Parameters / Panels & artwork / Pantone & coverage / Artwork colours / Dieline. Units live in the column headers.

import { getArtworkLayout, getWrapLayers, getWrapSize } from '../domain/artworkLayout';
import { DIELINE_RULES } from '../domain/config/productionRules';
import type { Dieline, Point2 } from '../domain/dieline';
import { PANEL_POSITIONS } from '../domain/factories';
import { getBottomAllowance } from '../domain/geometry/tube';
import { getPanelSize } from '../domain/panels';
import type { ArtworkPaletteResult, InkCoverageResult } from '../domain/printCoverage';
import type { Artwork, ArtworkPlacement, BagConfiguration } from '../domain/types';
import { exportFileBaseName, round, type ExportContext } from './format';
import { buildParameterSections } from './parameters';
import { artworkPaletteNotes } from './productSheetData';

export type CellValue = string | number | null;
/** A cell: plain value, or a value with a background fill (`#rrggbb`, e.g. a Pantone swatch) / bold text. */
export type Cell = CellValue | { value: CellValue; fill?: string; bold?: boolean };

export type WorkbookColumn = {
  header: string;
  /** Column width in characters. */
  width?: number;
  /** Excel number format, e.g. `0.00%` or `#,##0.0`. */
  numFmt?: string;
};

/** A titled table; blocks of one sheet are written below each other with a blank row in between. */
export type WorkbookBlock = { id: string; title?: string; columns: WorkbookColumn[]; rows: Cell[][] };

export type WorkbookSheetId = 'parameters' | 'panels' | 'coverage' | 'colors' | 'dieline';

export type WorkbookSheet = { id: WorkbookSheetId; name: string; blocks: WorkbookBlock[] };

export type WorkbookModel = { fileBaseName: string; title: string; sheets: WorkbookSheet[] };

export const cellValue = (cell: Cell): CellValue =>
  cell !== null && typeof cell === 'object' ? cell.value : cell;

const MM = '#,##0.##';
const PERCENT = '0.00%';

/** `extendToBottom` of a placement when the model has it (added by the positioning module, §4f). */
const extendToBottomOf = (placement: ArtworkPlacement): boolean | undefined => {
  const value = (placement as { extendToBottom?: unknown }).extendToBottom;
  return typeof value === 'boolean' ? value : undefined;
};

const length = (a: Point2, b: Point2) => Math.hypot(b.x - a.x, b.y - a.y);

/** One row of the "Panels & artwork" sheet: a wall (per-wall layout) or a whole-bag layer. */
type ArtworkRow = {
  label: string;
  /** Size of what the artwork is printed on: the wall, or the four walls around the bag. */
  size: { width: number; height: number };
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

export function buildWorkbookModel(
  configuration: BagConfiguration,
  coverage: InkCoverageResult | null,
  dieline: Dieline,
  context: ExportContext,
  palette: ArtworkPaletteResult | null = null,
): WorkbookModel {
  const { t } = context;
  const { dimensions, print } = configuration;
  // What is printed: per wall, or the whole-bag layers (bottom → top; placements relative to the whole wrap area,
  // docs/SPEC.md §3b). The layout is listed on the Parameters sheet.
  const artworkRows: ArtworkRow[] =
    getArtworkLayout(configuration) === 'WRAP'
      ? getWrapLayers(configuration).map((layer, index) => ({
          label: t('export.param.wrapLayer', { index: index + 1 }),
          size: getWrapSize(dimensions),
          artwork: layer.artwork,
          placement: layer.placement,
        }))
      : PANEL_POSITIONS.map((position) => ({
          label: t(`artwork.${position}`),
          size: getPanelSize(position, dimensions),
          artwork: configuration.panels[position].artwork,
          placement: configuration.panels[position].placement,
        }));
  const h = (key: string, unit?: string) => (unit ? `${t(`export.xlsx.col.${key}`)} [${unit}]` : t(`export.xlsx.col.${key}`));
  const mm = t('dimensions.unit');
  const mm2 = t('export.unit.mm2');
  const yesNo = (value: boolean) => t(value ? 'summary.yes' : 'summary.no');

  // ——— Parameters ———
  const parameters: WorkbookSheet = {
    id: 'parameters',
    name: t('export.xlsx.sheet.parameters'),
    blocks: [
      {
        id: 'parameters',
        columns: [
          { header: h('section'), width: 22 },
          { header: h('parameter'), width: 32 },
          { header: h('value'), width: 36 },
          { header: h('unit'), width: 10 },
        ],
        rows: buildParameterSections(configuration, dieline, t).flatMap((section) =>
          section.rows.map((row): Cell[] => [section.title, row.label, row.value, row.unit ?? null]),
        ),
      },
    ],
  };

  // ——— Panels & artwork ———
  const hasExtend = artworkRows.some((row) => extendToBottomOf(row.placement) !== undefined);
  const panelColumns: WorkbookColumn[] = [
    { header: h('panel'), width: 14 },
    { header: h('panelWidth', mm), width: 14, numFmt: MM },
    { header: h('panelHeight', mm), width: 14, numFmt: MM },
    { header: h('artworkFile'), width: 30 },
    { header: h('imageWidth', 'px'), width: 14 },
    { header: h('imageHeight', 'px'), width: 14 },
    { header: h('placementMode'), width: 18 },
    { header: h('offsetX', mm), width: 14, numFmt: MM },
    { header: h('offsetY', mm), width: 14, numFmt: MM },
    { header: h('scale'), width: 10, numFmt: '0.000' },
    { header: h('rotation', '°'), width: 10 },
    ...(hasExtend ? [{ header: h('extendToBottom'), width: 16 }, { header: h('artworkAreaHeight', mm), width: 16, numFmt: MM }] : []),
  ];
  const panelRows = artworkRows.map(({ label, size, artwork, placement }): Cell[] => {
    const custom = placement.mode === 'CUSTOM' ? placement : null;
    const extend = extendToBottomOf(placement);
    return [
      label,
      size.width,
      size.height,
      artwork?.fileName ?? t('summary.noArtwork'),
      artwork?.width ?? null,
      artwork?.height ?? null,
      t(`export.placementMode.${placement.mode}`),
      custom ? round(custom.offsetX, 2) : null,
      custom ? round(custom.offsetY, 2) : null,
      custom ? round(custom.scale, 3) : null,
      custom ? custom.rotation : null,
      ...(hasExtend
        ? [yesNo(extend ?? false), round(size.height + (extend ? getBottomAllowance(dimensions) : 0), 2)]
        : []),
    ];
  });
  const panelSheet: WorkbookSheet = {
    id: 'panels',
    name: t('export.xlsx.sheet.panels'),
    blocks: [{ id: 'panels', columns: panelColumns, rows: panelRows }],
  };

  // ——— Pantone & coverage ———
  const colorRows = print.pantoneColors.map((color, i): Cell[] => {
    const c = coverage?.colors[i];
    return [color.code, { value: color.hex, fill: color.hex }, c ? c.sheetRatio : null, c ? round(c.area, 0) : null];
  });
  const totalRow: Cell[] = [
    { value: t('coverage.total'), bold: true },
    null,
    { value: coverage ? coverage.sheetRatio : null, bold: true },
    { value: coverage ? round(coverage.inkArea, 0) : null, bold: true },
  ];
  const unassignedRow: Cell[] = [
    t('coverage.unassigned'),
    null,
    coverage ? coverage.unassignedSheetRatio : null,
    coverage ? round(coverage.unassignedArea, 0) : null,
  ];
  const coverageNotes: Cell[][] = [
    [h('sheetArea', mm2), coverage ? round(coverage.sheetArea, 0) : round(dieline.sheet.width * dieline.sheet.height, 0)],
    [t('export.xlsx.note'), coverage ? t('coverage.estimateNote') : t('export.coverage.none')],
  ];
  const panelCoverageRows = coverage
    ? PANEL_POSITIONS.flatMap((position): Cell[][] => {
        const p = coverage.panels[position];
        if (!p) return [];
        return [[t(`artwork.${position}`), round(p.wallArea, 0), round(p.inkArea, 0), p.wallArea > 0 ? p.inkArea / p.wallArea : 0]];
      })
    : [];
  const coverageSheet: WorkbookSheet = {
    id: 'coverage',
    name: t('export.xlsx.sheet.coverage'),
    blocks: [
      {
        id: 'pantone',
        title: t('export.pantone.title'),
        columns: [
          { header: h('pantoneCode'), width: 22 },
          { header: h('hex'), width: 12 },
          { header: h('sheetShare', '%'), width: 16, numFmt: PERCENT },
          { header: h('inkArea', mm2), width: 16, numFmt: '#,##0' },
        ],
        rows: [...colorRows, totalRow, unassignedRow],
      },
      ...(panelCoverageRows.length > 0
        ? [
            {
              id: 'panel-coverage',
              title: t('export.xlsx.panelCoverage'),
              columns: [
                { header: h('panel'), width: 22 },
                { header: h('wallArea', mm2), width: 12, numFmt: '#,##0' },
                { header: h('inkArea', mm2), width: 16, numFmt: '#,##0' },
                { header: h('wallShare', '%'), width: 16, numFmt: PERCENT },
              ],
              rows: panelCoverageRows,
            },
          ]
        : []),
      {
        id: 'coverage-notes',
        columns: [
          { header: h('parameter'), width: 22 },
          { header: h('value'), width: 12 },
        ],
        rows: coverageNotes,
      },
    ],
  };

  // ——— Artwork colours (HEX) ———
  const cm2 = t('export.unit.cm2');
  const paletteRows: Cell[][] = palette
    ? [
        ...palette.colors.map((color): Cell[] => [
          { value: null, fill: color.hex },
          color.hex,
          color.pantone?.code ?? null,
          color.pantone ? round(color.pantone.deltaE, 1) : null,
          round(color.area / 100, 1),
          color.sheetRatio,
          color.inkShare,
        ]),
        ...(palette.other.area > 0
          ? [
              [
                null,
                t('coverage.palette.other', { count: palette.other.colorCount }),
                null,
                null,
                round(palette.other.area / 100, 1),
                palette.other.sheetRatio,
                palette.inkArea > 0 ? palette.other.area / palette.inkArea : 0,
              ] as Cell[],
            ]
          : []),
        [
          null,
          { value: t('coverage.total'), bold: true },
          null,
          null,
          { value: round(palette.inkArea / 100, 1), bold: true },
          { value: palette.sheetRatio, bold: true },
          { value: palette.inkArea > 0 ? 1 : 0, bold: true },
        ],
      ]
    : [];
  const colorsSheet: WorkbookSheet = {
    id: 'colors',
    name: t('export.xlsx.sheet.colors'),
    blocks: [
      {
        id: 'artwork-colors',
        title: t('export.artworkColors.title'),
        columns: [
          { header: h('swatch'), width: 10 },
          { header: t('export.artworkColors.hex'), width: 30 },
          { header: h('nearestPantone'), width: 22 },
          { header: h('deltaE'), width: 14, numFmt: '0.0' },
          { header: h('inkArea', cm2), width: 18, numFmt: '#,##0.0' },
          { header: h('sheetShare', '%'), width: 16, numFmt: PERCENT },
          { header: h('inkShare', '%'), width: 16, numFmt: PERCENT },
        ],
        rows: paletteRows,
      },
      {
        id: 'artwork-colors-notes',
        columns: [
          { header: h('parameter'), width: 10 },
          { header: h('value'), width: 30 },
        ],
        rows: (!palette
          ? [t('export.artworkColors.none')]
          : palette.colors.length === 0
            ? [t('export.artworkColors.empty')]
            : artworkPaletteNotes(palette, context)
        ).map((note): Cell[] => [t('export.xlsx.note'), note]),
      },
    ],
  };

  // ——— Dieline ———
  const sheetBlock: WorkbookBlock = {
    id: 'sheet',
    title: t('export.xlsx.dielineSheet'),
    columns: [
      { header: h('parameter'), width: 34 },
      { header: h('value'), width: 14, numFmt: MM },
      { header: h('unit'), width: 10 },
    ],
    rows: [
      [t('export.param.sheetWidth'), dieline.sheet.width, mm],
      [t('export.param.sheetHeight'), dieline.sheet.height, mm],
      [t('export.param.bottomAllowance'), dieline.allowance, mm],
      [t('export.param.glueFlap'), dieline.glueFlapWidth, mm],
      [t('export.xlsx.bottomLineY'), dieline.bottomLineY, mm],
      [t('export.xlsx.bleed'), DIELINE_RULES.bleed, mm],
      [t('export.xlsx.origin'), t('export.xlsx.originValue'), null],
    ],
  };
  const columnRows: Cell[][] = [
    ...dieline.segments.map((segment): Cell[] => [
      t(`dieline.panel.${segment.panel}`),
      round(segment.x0, 2),
      round(segment.x1, 2),
      round(segment.x1 - segment.x0, 2),
      round(segment.wall.height, 2),
      round(segment.allowance.height, 2),
    ]),
    [
      t('dieline.label.glueFlap'),
      round(dieline.glueFlap.x, 2),
      round(dieline.glueFlap.x + dieline.glueFlap.width, 2),
      round(dieline.glueFlap.width, 2),
      round(dieline.glueFlap.height, 2),
      null,
    ],
  ];
  const columnsBlock: WorkbookBlock = {
    id: 'columns',
    title: t('export.xlsx.dielineColumns'),
    columns: [
      { header: h('column'), width: 34 },
      { header: h('xFrom', mm), width: 14, numFmt: MM },
      { header: h('xTo', mm), width: 12, numFmt: MM },
      { header: h('columnWidth', mm), width: 14, numFmt: MM },
      { header: h('wallHeight', mm), width: 16, numFmt: MM },
      { header: h('allowanceHeight', mm), width: 16, numFmt: MM },
    ],
    rows: columnRows,
  };

  const cutLines = dieline.cuts.flatMap((polygon, pi) =>
    polygon.map((from, i) => ({ id: `cut-${pi + 1}-${i + 1}`, from, to: polygon[(i + 1) % polygon.length] })),
  );
  const lineRows: Cell[][] = [
    ...cutLines.map((line): Cell[] => [
      line.id,
      t('export.xlsx.lineKind.cut'),
      null,
      t('export.xlsx.cutOutline'),
      round(line.from.x, 2),
      round(line.from.y, 2),
      round(line.to.x, 2),
      round(line.to.y, 2),
      round(length(line.from, line.to), 2),
    ]),
    ...dieline.creases.map((line): Cell[] => [
      line.id,
      t('export.xlsx.lineKind.crease'),
      line.code,
      t(`export.creaseCode.${line.code}`),
      round(line.from.x, 2),
      round(line.from.y, 2),
      round(line.to.x, 2),
      round(line.to.y, 2),
      round(length(line.from, line.to), 2),
    ]),
  ];
  const linesBlock: WorkbookBlock = {
    id: 'lines',
    title: t('export.xlsx.dielineLines'),
    columns: [
      { header: h('lineId'), width: 34 },
      { header: h('lineKind'), width: 14 },
      { header: h('code'), width: 12 },
      { header: h('description'), width: 34 },
      { header: h('x1', mm), width: 16, numFmt: MM },
      { header: h('y1', mm), width: 16, numFmt: MM },
      { header: h('x2', mm), width: 12, numFmt: MM },
      { header: h('y2', mm), width: 12, numFmt: MM },
      { header: h('length', mm), width: 14, numFmt: MM },
    ],
    rows: lineRows,
  };
  const patchBlocks: WorkbookBlock[] =
    dieline.handlePatches.length > 0
      ? [
          {
            id: 'patches',
            title: t('export.xlsx.handlePatches'),
            columns: [
              { header: h('panel'), width: 34 },
              { header: h('x', mm), width: 14, numFmt: MM },
              { header: h('y', mm), width: 12, numFmt: MM },
              { header: h('width', mm), width: 14, numFmt: MM },
              { header: h('height', mm), width: 16, numFmt: MM },
            ],
            rows: dieline.handlePatches.map((patch): Cell[] => [
              t(`dieline.panel.${patch.panel}`),
              round(patch.rect.x, 2),
              round(patch.rect.y, 2),
              round(patch.rect.width, 2),
              round(patch.rect.height, 2),
            ]),
          },
        ]
      : [];
  const dielineSheet: WorkbookSheet = {
    id: 'dieline',
    name: t('export.xlsx.sheet.dieline'),
    blocks: [sheetBlock, columnsBlock, linesBlock, ...patchBlocks],
  };

  return {
    fileBaseName: exportFileBaseName(configuration, t),
    title: t('export.pdf.subtitle', {
      type: t(`productType.${configuration.productType}`),
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
    }),
    sheets: [parameters, panelSheet, coverageSheet, colorsSheet, dielineSheet],
  };
}
