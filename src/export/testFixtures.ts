// Test fixtures of the export builders (imported by *.test.ts only).

import { buildDieline } from '../domain/dieline';
import { createArtwork, createConfiguration, createHandle } from '../domain/factories';
import type { ArtworkPaletteResult, InkCoverageResult } from '../domain/printCoverage';
import type { ArtworkPlacement, BagConfiguration } from '../domain/types';
import i18n from '../i18n';
import type { Language } from '../i18n';
import type { ExportContext } from './format';

export const exportContext = (language: Language): ExportContext => ({
  t: i18n.getFixedT(language) as ExportContext['t'],
  language,
});

/** 200 × 400 × 150, twisted handle, two Pantone colours, artwork on FRONT (FILL) and BACK (CUSTOM). */
export function sampleConfiguration(): BagConfiguration {
  const configuration = createConfiguration();
  const artwork = (fileName: string) =>
    createArtwork({ fileName, fileUrl: `blob:${fileName}`, mimeType: 'image/png', width: 2000, height: 4000, sizeBytes: 1000 });
  const custom = {
    mode: 'CUSTOM',
    offsetX: 12.345,
    offsetY: -8,
    scale: 0.75,
    rotation: 90,
    extendToBottom: true,
  } as ArtworkPlacement;
  return {
    ...configuration,
    handle: createHandle('TWISTED_PAPER'),
    print: {
      technology: 'FLEXO',
      pantoneColors: [
        { code: 'PMS 186 C', hex: '#c8102e' },
        { code: 'Black C', hex: '#2d2926' },
      ],
      colorAnalysis: { mergeTolerance: 10, minAreaShare: 0.005 },
    },
    panels: {
      ...configuration.panels,
      FRONT: { ...configuration.panels.FRONT, artwork: artwork('przód.png') },
      BACK: { ...configuration.panels.BACK, artwork: artwork('tył.png'), placement: custom },
    },
  };
}

export const sampleDieline = (configuration: BagConfiguration) => buildDieline(configuration);

/** Coverage result consistent with the 710 × 490 mm sheet. */
export function sampleCoverage(): InkCoverageResult {
  const sheetArea = 710 * 490;
  return {
    sheetArea,
    inkArea: 52185,
    sheetRatio: 52185 / sheetArea,
    colors: [
      { code: 'PMS 186 C', hex: '#c8102e', area: 43487.5, sheetRatio: 0.125 },
      { code: 'Black C', hex: '#2d2926', area: 8697.5, sheetRatio: 0.025 },
    ],
    unassignedArea: 0,
    unassignedSheetRatio: 0,
    poorMatchArea: 0,
    panels: {
      FRONT: { wallArea: 80000, inkArea: 40000, colorAreas: [35000, 5000], unassignedArea: 0 },
      BACK: { wallArea: 80000, inkArea: 12185, colorAreas: [8487.5, 3697.5], unassignedArea: 0 },
    },
    hints: [],
  };
}

/** Artwork palette consistent with `sampleCoverage` (52 185 mm² of ink): two colours + minor shades. */
export function samplePalette(): ArtworkPaletteResult {
  const sheetArea = 710 * 490;
  const color = (hex: string, area: number, pantone: ArtworkPaletteResult['colors'][number]['pantone']) => ({
    hex,
    lab: { l: 0, a: 0, b: 0 },
    shadeCount: 12,
    area,
    sheetRatio: area / sheetArea,
    inkShare: area / 52185,
    pantone,
  });
  return {
    sheetArea,
    inkArea: 52185,
    sheetRatio: 52185 / sheetArea,
    colors: [
      color('#c8102e', 43000, { code: 'PMS 186 C', hex: '#c8102e', deltaE: 0 }),
      color('#1f1f1f', 8500, { code: 'Black C', hex: '#2d2926', deltaE: 6.04 }),
    ],
    other: { area: 685, sheetRatio: 685 / sheetArea, colorCount: 3 },
    rawColorCount: 42,
    settings: { mergeTolerance: 10, minAreaShare: 0.005 },
  };
}
