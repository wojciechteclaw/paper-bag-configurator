// Parameter list of the configuration, shared by the PDF product sheet and the Excel "Parameters" sheet.
// Pure: configuration + dieline in, localized rows out (values stay numeric where they are numbers).

import { getBagWeight } from '../domain/bagWeight';
import { BAG_TYPES } from '../domain/config/productCatalog';
import { getHandlePatchSize, type Dieline } from '../domain/dieline';
import { getHandleLayout, getHandlePaperColor, resolveHandleParams } from '../domain/geometry/handles';
import { findStandardSize, getHandleVariant, getHandleVariantDefinition } from '../domain/handleVariants';
import { getActiveArtworkTargets, getArtworkLayout, getArtworkSlot } from '../domain/artworkLayout';
import { normalizeColorAnalysis } from '../domain/printCoverage/colorAnalysis';
import type { BagConfiguration } from '../domain/types';
import type { Translate } from './format';

export type ParameterValue = string | number;

export type ParameterRow = {
  id: string;
  label: string;
  value: ParameterValue;
  /** Unit of a numeric value (mm, g/m², cm²…). */
  unit?: string;
};

export type ParameterSectionId = 'product' | 'paper' | 'handle' | 'print' | 'construction' | 'artwork';

export type ParameterSection = { id: ParameterSectionId; title: string; rows: ParameterRow[] };

export function buildParameterSections(configuration: BagConfiguration, dieline: Dieline, t: Translate): ParameterSection[] {
  const { dimensions, paper, handle, print } = configuration;
  const yesNo = (value: boolean) => t(value ? 'summary.yes' : 'summary.no');
  const mm = t('dimensions.unit');
  const row = (id: string, value: ParameterValue, unit?: string): ParameterRow => ({
    id,
    label: t(`export.param.${id}`),
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

  // Layout first, then the artwork of the active layout only (kept artwork of the other layout is not printed).
  const layout = getArtworkLayout(configuration);
  const artwork: ParameterRow[] = [
    { id: 'artworkLayout', label: t('export.param.artworkLayout'), value: t(`artwork.layout.${layout}`) },
    ...getActiveArtworkTargets(configuration).map((target) => ({
      id: `artwork${target}`,
      label: t(`artwork.${target}`),
      value: getArtworkSlot(configuration, target).artwork?.fileName ?? t('summary.noArtwork'),
    })),
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
    section('artwork', artwork),
  ];
}
