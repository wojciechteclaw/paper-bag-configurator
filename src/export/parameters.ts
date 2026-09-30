// Parameter list of the configuration, shared by the PDF product sheet and the Excel "Parameters" sheet.
// Pure: configuration + dieline in, localized rows out (values stay numeric where they are numbers).

import { getBagWeight } from '../domain/bagWeight';
import { BAG_TYPES } from '../domain/config/productCatalog';
import { getHandlePatchSize, type Dieline } from '../domain/dieline';
import { getHandleLayout, getHandlePaperColor, resolveHandleParams } from '../domain/geometry/handles';
import { findStandardSize, getHandleVariant, getHandleVariantDefinition } from '../domain/handleVariants';
import { getActiveArtworkTargets, getArtworkLayout, getArtworkSlot, getWrapLayers } from '../domain/artworkLayout';
import { normalizeColorAnalysis } from '../domain/printCoverage/colorAnalysis';
import { getWindow, getWindowDimensions, getWindowFilm, getWindowOpening } from '../domain/window';
import type { ArtworkPlacement, BagConfiguration, BagType } from '../domain/types';
import type { Translate } from './format';

/**
 * Short placement description for listings (whole-bag layers): "fills the area" or offsets (mm from the area centre,
 * rounded), scale (% of contain) and rotation; plus "extended to the bottom" when set.
 */
export function describePlacement(placement: ArtworkPlacement, t: Translate): string {
  const text =
    placement.mode === 'FILL'
      ? t('export.placementSummary.FILL')
      : t('export.placementSummary.CUSTOM', {
          x: Math.round(placement.offsetX) + 0,
          y: Math.round(placement.offsetY) + 0,
          scale: Math.round(placement.scale * 100),
          rotation: placement.rotation,
        });
  return placement.extendToBottom ? `${text}, ${t('export.placementSummary.extended')}` : text;
}

/**
 * Window rows (docs/SPEC.md §2b): type, film material, opening size and position (centred on FRONT, lower edge above the
 * bottom fold line; the panoramic strip runs up to the mouth), film overlap, film size and area. Opening and film
 * sizes come from the domain (`getWindowOpening` / `getWindowFilm`), the same as the dieline.
 */
function buildWindowRows(
  configuration: BagConfiguration,
  row: (id: string, value: ParameterValue, unit?: string) => ParameterRow,
  t: Translate,
): ParameterRow[] {
  const window = getWindow(configuration);
  if (!window) return [row('windowType', t('window.none'))];
  const mm = t('dimensions.unit');
  const opening = getWindowOpening(window, getWindowDimensions(configuration));
  const film = getWindowFilm(window, getWindowDimensions(configuration));
  const r1 = (value: number) => Math.round(value * 10) / 10;
  return [
    row('windowType', t(`window.type.${window.type}`)),
    row('windowMaterial', t(`window.material.${window.material}`)),
    row('windowWidth', r1(opening.width), mm),
    row('windowHeight', r1(opening.height), mm),
    row('windowBottomOffset', r1(opening.y), mm),
    row('windowPosition', t(opening.openAtTop ? 'export.param.windowPositionPanoramic' : 'export.param.windowPositionRectangle')),
    row('windowFilmOverlap', window.filmOverlap, mm),
    row('windowFilmSize', t('export.param.windowFilmSizeValue', { width: r1(film.width), height: r1(film.height) }), mm),
    row('windowFilmArea', Math.round((film.width * film.height) / 10) / 10, t('export.unit.cm2')),
  ];
}

export type ParameterValue = string | number;

export type ParameterRow = {
  id: string;
  label: string;
  value: ParameterValue;
  /** Unit of a numeric value (mm, g/m², cm²…). */
  unit?: string;
};

export type ParameterSectionId = 'product' | 'paper' | 'handle' | 'print' | 'construction' | 'window' | 'artwork';

export type ParameterSection = { id: ParameterSectionId; title: string; rows: ParameterRow[] };

/**
 * Parameters worded differently for the gusseted-bag bag (client notation [K]): depth is the gusset F ("fałda"), the
 * allowance the bottom strip d, the glue flap the seam overlap s.
 */
const GUSSETED_PARAMETER_LABELS: ReadonlySet<string> = new Set(['depth', 'bottomAllowance', 'glueFlap']);

/** i18n key of a parameter label for a bag type. */
export function parameterLabelKey(productType: BagType, id: string): string {
  return productType === 'FOLDED' && GUSSETED_PARAMETER_LABELS.has(id) ? `export.param.folded.${id}` : `export.param.${id}`;
}

export function buildParameterSections(configuration: BagConfiguration, dieline: Dieline, t: Translate): ParameterSection[] {
  const { dimensions, paper, handle, print } = configuration;
  const yesNo = (value: boolean) => t(value ? 'summary.yes' : 'summary.no');
  const mm = t('dimensions.unit');
  const row = (id: string, value: ParameterValue, unit?: string): ParameterRow => ({
    id,
    label: t(parameterLabelKey(configuration.productType, id)),
    value,
    ...(unit ? { unit } : {}),
  });

  const definition = BAG_TYPES[configuration.productType];
  const standard = findStandardSize(dimensions, getHandleVariantDefinition(definition, handle).standardSizes);

  const product: ParameterRow[] = [
    row('productType', t(`productType.${configuration.productType}`)),
    row('width', dimensions.width, mm),
    row('height', dimensions.height, mm),
    row('depth', dimensions.depth, mm),
    row(
      'standardSize',
      standard ? t('dimensions.standardSize.option', standard.dimensions) : t('dimensions.standardSize.custom'),
    ),
  ];

  const paperRows: ParameterRow[] = [
    row('paperType', t(`paper.types.${paper.type}`)),
    row('paperColor', t(`paper.${paper.color}`)),
    row('grammage', paper.grammage, t('paper.grammageUnit')),
    row('bagWeight', Math.round(getBagWeight(configuration).grams * 10) / 10, 'g'),
    row('fsc', yesNo(paper.fscCertified)),
    row('moistureBarrier', yesNo(paper.moistureBarrier)),
  ];

  const variant = getHandleVariant(handle);
  const handleRows: ParameterRow[] = [row('handleVariant', t(variant === 'NONE' ? 'handle.none' : `handle.${variant}`))];
  if (handle) {
    const params = resolveHandleParams(handle);
    const layout = getHandleLayout(handle, dimensions);
    const patch = getHandlePatchSize(handle, dimensions.width);
    handleRows.push(
      row('handleMaterial', t(`export.handleMaterial.${handle.material}`)),
      row('handleColor', t(`paper.${getHandlePaperColor(paper)}`)),
      row(handle.type === 'TWISTED_PAPER' ? 'ropeDiameter' : 'stripWidth', params.width, mm),
      row('loopHeight', layout.loopHeight, mm),
      row('loopLength', Math.round(layout.loopLength), mm),
      row('patchWidth', patch.width, mm),
      row('patchHeight', patch.height, mm),
      row('handleMounting', t('export.handleMounting')),
    );
  }

  const colorAnalysis = normalizeColorAnalysis(print.colorAnalysis);
  const printRows: ParameterRow[] = [
    row('printTechnology', t(`print.${print.technology}`)),
    row('colorCount', print.pantoneColors.length),
    row(
      'pantoneColors',
      print.pantoneColors.length > 0 ? print.pantoneColors.map((c) => c.code).join(', ') : t('summary.noPrint'),
    ),
    row('colorMergeTolerance', colorAnalysis.mergeTolerance),
    row('colorMinAreaShare', Math.round(colorAnalysis.minAreaShare * 1000) / 10, '%'),
    row('packaging', t(`packaging.${configuration.packaging}`)),
  ];

  const construction: ParameterRow[] = [
    row('bottomAllowance', dieline.allowance, mm),
    row('glueFlap', dieline.glueFlapWidth, mm),
    row('sheetWidth', dieline.sheet.width, mm),
    row('sheetHeight', dieline.sheet.height, mm),
    row('sheetArea', (dieline.sheet.width * dieline.sheet.height) / 100, t('export.unit.cm2')),
  ];
  // Gusseted bag [K]: print area per side W × (H − d), the bottom strip d excluded.
  if (configuration.productType === 'FOLDED') {
    construction.push(
      row('printArea', t('export.param.printAreaValue', { width: dimensions.width, height: dimensions.height - dieline.allowance }), mm),
    );
  }

  // Layout first, then the artwork of the active layout only (kept artwork of the other layout is not printed). Whole-bag
  // layers are listed bottom → top, each with its placement (docs/SPEC.md §3b).
  const layout = getArtworkLayout(configuration);
  const wrapLayers = getWrapLayers(configuration);
  const artwork: ParameterRow[] = [
    { id: 'artworkLayout', label: t('export.param.artworkLayout'), value: t(`artwork.layout.${layout}`) },
    ...(layout === 'WRAP'
      ? wrapLayers.length === 0
        ? [{ id: 'artworkWrapLayers', label: t('export.param.wrapLayers'), value: t('summary.noArtwork') }]
        : wrapLayers.map((layer, index) => ({
            id: `artworkWrapLayer${index + 1}`,
            label: t('export.param.wrapLayer', { index: index + 1 }),
            value: `${layer.artwork.fileName} — ${describePlacement(layer.placement, t)}`,
          }))
      : getActiveArtworkTargets(configuration).map((target) => ({
          id: `artwork${target}`,
          label: t(`artwork.${target}`),
          value: getArtworkSlot(configuration, target).artwork?.fileName ?? t('summary.noArtwork'),
        }))),
  ];

  const section = (id: ParameterSectionId, rows: ParameterRow[]): ParameterSection => ({
    id,
    title: t(`export.section.${id}`),
    rows,
  });

  return [
    section('product', product),
    section('paper', paperRows),
    section('handle', handleRows),
    section('construction', construction),
    section('print', printRows),
    ...(definition.windowAvailable ? [section('window', buildWindowRows(configuration, row, t))] : []),
    section('artwork', artwork),
  ];
}
