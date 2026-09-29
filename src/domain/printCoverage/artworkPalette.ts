// Colours actually present in the placed artwork (docs/SPEC.md §4d, "Kolory w grafikach").
// Pure TS, no DOM, deterministic. Independent of the Pantone list — which is only used to name the nearest Pantone.
//
// Raw pixels of real artwork carry many near-identical shades (anti-aliased edges, JPEG noise, gradients, specks).
// They are merged into the inks a printer would see, controlled by `ColorAnalysisSettings` (stored in the
// configuration, so the live table and the PDF / Excel exports agree):
//
// 1. Sampling and ink rules are those of `computeInkCoverage` (`walkArtworkCells` + `classifyInkPixel`: placement,
//    extend-to-bottom area, alpha weighting, near-white = bare paper on WHITE paper, white = ink on BROWN paper), so
//    the palette's total equals the coverage total. Every distinct sampled sRGB colour ("raw shade") keeps its area.
// 2. Raw shades are binned (`binBits` per channel, reduced until ≤ `maxWorkingBins` bins remain) — a bin is an
//    area-weighted CIELAB / sRGB mean.
// 3. Agglomerative merge (centroid linkage): the closest pair of clusters is merged while its CIEDE2000 ΔE00 is
//    below `mergeTolerance`; the merged colour is the area-weighted Lab mean. ΔE00 (not CIE76) so one tolerance
//    behaves alike for saturated colours and near-neutrals.
// 4. Anti-aliasing (tolerance > 0): a shade whose sRGB lies on the straight segment between two much larger colours
//    (or between a colour and the white paper) is a blend of them — browsers blend in gamma-encoded sRGB — and is
//    moved to the nearer end (blend fraction < ½). A real third colour is protected by its size (`edgeMaxAreaRatio`).
// 5. Colours under `minAreaShare` of the ink are absorbed by the nearest listed colour within
//    `mergeTolerance × minorAbsorbFactor` ΔE00, else reported as "other" (tolerance 0 → always "other").
// 6. At most `maxColors` colours, largest first. The HEX of a colour is a real sampled colour: the most frequent raw
//    shade within max(2, tolerance / 2) ΔE00 of the cluster mean (the mean itself may exist in no pixel), or the raw
//    shade nearest to the mean when none is that close.

import { ARTWORK_PALETTE_RULES, PRINT_COVERAGE_RULES } from '../config/productCatalog';
import type { ColorAnalysisSettings, PantoneColor, PaperColor } from '../types';
import { deltaE2000, deltaE76, hexToRgb, rgbToHex, rgbToLab, type Lab } from './color';
import { normalizeColorAnalysis } from './colorAnalysis';
import type { InkCoverageRules } from './computeInkCoverage';
import { classifyInkPixel, walkArtworkCells, type PixelSample, type SamplingInput } from './sampling';

export type ArtworkPaletteRules = {
  binBits: number;
  maxWorkingBins: number;
  maxColors: number;
  edgeMaxDistance: number;
  edgeMaxAreaRatio: number;
  minorAbsorbFactor: number;
};

export type ArtworkPaletteInput = SamplingInput & {
  paperColor: PaperColor;
  /** Used only to name the nearest Pantone of each colour (may be empty). */
  pantoneColors?: readonly PantoneColor[];
  /** Merge settings (`PrintSpec.colorAnalysis`); missing / invalid values → catalog defaults. */
  colorAnalysis?: Partial<ColorAnalysisSettings> | null;
  /** Overrides of `PRINT_COVERAGE_RULES` (ink classification / grid), as in `computeInkCoverage`. */
  rules?: Partial<InkCoverageRules>;
  /** Overrides of `ARTWORK_PALETTE_RULES`. */
  paletteRules?: Partial<ArtworkPaletteRules>;
};

export type NearestPantone = { code: string; hex: string; /** CIE76 ΔE to the Pantone preview colour. */ deltaE: number };

export type ArtworkColor = {
  /** Representative colour, `#rrggbb` — a real sampled colour of the cluster (see the file comment, step 6). */
  hex: string;
  /** CIELAB of `hex`. */
  lab: Lab;
  /** Printed area, mm². */
  area: number;
  /** Share of the sheet area, 0–1. */
  sheetRatio: number;
  /** Share of the total ink area, 0–1. */
  inkShare: number;
  /** Number of raw sampled shades merged into this colour. */
  shadeCount: number;
  /** Nearest Pantone of the print list by preview colour; null when the list is empty. */
  pantone: NearestPantone | null;
};

export type ArtworkPaletteResult = {
  /** Cut sheet area (as in `computeInkCoverage`), mm². */
  sheetArea: number;
  /** Total ink area (= sum of the colours + other), mm². */
  inkArea: number;
  sheetRatio: number;
  /** Sorted by area, largest first. */
  colors: ArtworkColor[];
  /** Colours beyond `maxColors`, or under the minimum share with no listed colour close enough, together. */
  other: { area: number; sheetRatio: number; colorCount: number };
  /** Distinct sampled ink colours before merging. */
  rawColorCount: number;
  /** The (normalised) settings the palette was computed with. */
  settings: ColorAnalysisSettings;
};

type Rgb3 = [number, number, number];

type Cluster = {
  area: number;
  lab: Lab;
  rgb: Rgb3;
  /** Indices of the bins in the cluster. */
  bins: number[];
};

type Bin = { area: number; lab: Lab; rgb: Rgb3; shades: number[] };

const NO_INK = -1;
const UNKNOWN = -2;

/** Area-weighted mean of bins (Lab and sRGB). */
function clusterOf(binIndices: number[], bins: readonly Bin[]): Cluster {
  let area = 0;
  const lab = { l: 0, a: 0, b: 0 };
  const rgb: Rgb3 = [0, 0, 0];
  for (const i of binIndices) {
    const bin = bins[i];
    area += bin.area;
    lab.l += bin.lab.l * bin.area;
    lab.a += bin.lab.a * bin.area;
    lab.b += bin.lab.b * bin.area;
    for (let c = 0; c < 3; c++) rgb[c] += bin.rgb[c] * bin.area;
  }
  if (area > 0) {
    lab.l /= area;
    lab.a /= area;
    lab.b /= area;
    for (let c = 0; c < 3; c++) rgb[c] /= area;
  }
  return { area, lab, rgb, bins: binIndices };
}

/** Merges the closest pair (centroid linkage, ΔE00) while it is closer than `tolerance`. */
function mergeClusters(initial: readonly Cluster[], allBins: readonly Bin[], tolerance: number): Cluster[] {
  const clusters = initial.slice();
  const n = clusters.length;
  if (tolerance <= 0 || n < 2) return clusters;
  const alive = new Array<boolean>(n).fill(true);
  const nn = new Int32Array(n).fill(-1);
  const nnDistance = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const findNearest = (i: number) => {
    nn[i] = -1;
    nnDistance[i] = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (j === i || !alive[j]) continue;
      const d = deltaE2000(clusters[i].lab, clusters[j].lab);
      if (d < nnDistance[i]) {
        nnDistance[i] = d;
        nn[i] = j;
      }
    }
  };
  for (let i = 0; i < n; i++) findNearest(i);

  for (;;) {
    let i = -1;
    let best = tolerance;
    for (let k = 0; k < n; k++) {
      if (alive[k] && nnDistance[k] < best) {
        best = nnDistance[k];
        i = k;
      }
    }
    if (i < 0) break;
    const keep = Math.min(i, nn[i]);
    const drop = Math.max(i, nn[i]);
    clusters[keep] = clusterOf([...clusters[keep].bins, ...clusters[drop].bins], allBins);
    alive[drop] = false;
    findNearest(keep);
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === keep) continue;
      if (nn[k] === keep || nn[k] === drop) findNearest(k);
      else {
        const d = deltaE2000(clusters[k].lab, clusters[keep].lab);
        if (d < nnDistance[k]) {
          nnDistance[k] = d;
          nn[k] = keep;
        }
      }
    }
  }
  return clusters.filter((_, k) => alive[k]);
}

/** Position of `p` along a → b (0–1 when between them) and its distance from the segment's line, in sRGB. */
function onSegment(p: Rgb3, a: Rgb3, b: Rgb3): { t: number; distance: number } {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const length2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  if (length2 === 0) return { t: 0, distance: Math.hypot(ap[0], ap[1], ap[2]) };
  const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / length2;
  return { t, distance: Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]) };
}

const PAPER_WHITE: Rgb3 = [255, 255, 255];

/**
 * Step 4: bins of a cluster that lie on the segment between two much larger clusters (or a cluster and the white
 * paper) move to the nearer end. Returns the new clusters (emptied ones dropped).
 */
function attributeEdgeShades(
  clusters: readonly Cluster[],
  bins: readonly Bin[],
  paperColor: PaperColor,
  rules: ArtworkPaletteRules,
): Cluster[] {
  const moves = clusters.map(() => [] as number[]);
  const stays = clusters.map(() => [] as number[]);
  clusters.forEach((cluster, c) => {
    const ends = clusters
      .map((other, index) => ({ index, rgb: other.rgb, area: other.area }))
      .filter((end) => end.index !== c && cluster.area <= rules.edgeMaxAreaRatio * end.area);
    for (const binIndex of cluster.bins) {
      const p = bins[binIndex].rgb;
      let target = -1;
      let bestDistance = rules.edgeMaxDistance;
      const consider = (a: (typeof ends)[number], bRgb: Rgb3, bIndex: number) => {
        const { t, distance } = onSegment(p, a.rgb, bRgb);
        if (t < 0 || t > 1 || distance > bestDistance) return;
        bestDistance = distance;
        target = t <= 0.5 || bIndex < 0 ? a.index : bIndex;
      };
      for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) consider(ends[i], ends[j].rgb, ends[j].index);
        if (paperColor === 'WHITE') consider(ends[i], PAPER_WHITE, -1); // a blend with the paper stays the ink
      }
      if (target >= 0) moves[target].push(binIndex);
      else stays[c].push(binIndex);
    }
  });
  return clusters
    .map((_, c) => [...stays[c], ...moves[c]])
    .filter((binIndices) => binIndices.length > 0)
    .map((binIndices) => clusterOf(binIndices, bins));
}

export function computeArtworkPalette(input: ArtworkPaletteInput): ArtworkPaletteResult {
  const inkRules: InkCoverageRules = { ...PRINT_COVERAGE_RULES, ...input.rules };
  const rules: ArtworkPaletteRules = { ...ARTWORK_PALETTE_RULES, ...input.paletteRules };
  const settings = normalizeColorAnalysis(input.colorAnalysis);
  const { mergeTolerance: tolerance, minAreaShare } = settings;
  const { dieline, paperColor } = input;
  const sheetArea = dieline.sheet.width * dieline.sheet.height;

  // 1. Raw shades: distinct sRGB colours with their ink area (memoised per sample pixel).
  const shadeIndex = new Map<number, number>();
  const shadeRgb: number[] = [];
  const shadeLab: Lab[] = [];
  const shadeArea: number[] = [];
  const memo = new Map<PixelSample, { shade: Int32Array; weight: Float32Array }>();
  walkArtworkCells(input, inkRules.gridCellsLongSide, {
    onCell: (_position, sample, pixel, cellArea) => {
      let m = memo.get(sample);
      if (!m) {
        const size = sample.width * sample.height;
        m = { shade: new Int32Array(size).fill(UNKNOWN), weight: new Float32Array(size) };
        memo.set(sample, m);
      }
      if (m.shade[pixel] === UNKNOWN) {
        const ink = classifyInkPixel(sample.data, pixel, paperColor, inkRules);
        if (!ink) m.shade[pixel] = NO_INK;
        else {
          const o = pixel * 4;
          const key = (sample.data[o] << 16) | (sample.data[o + 1] << 8) | sample.data[o + 2];
          let index = shadeIndex.get(key);
          if (index === undefined) {
            index = shadeRgb.length;
            shadeIndex.set(key, index);
            shadeRgb.push(key);
            shadeLab.push(ink.lab);
            shadeArea.push(0);
          }
          m.shade[pixel] = index;
          m.weight[pixel] = ink.weight;
        }
      }
      const shade = m.shade[pixel];
      if (shade !== NO_INK) shadeArea[shade] += cellArea * m.weight[pixel];
    },
  });
  const rawColorCount = shadeRgb.length;
  const inkArea = shadeArea.reduce((sum, area) => sum + area, 0);

  // 2. Bins (fewer bits until the merge stays cheap).
  const shadeBin = new Int32Array(rawColorCount);
  const binKeys = new Map<number, number>();
  for (let bits = Math.min(8, Math.max(1, Math.round(rules.binBits))); ; bits--) {
    binKeys.clear();
    const shift = 8 - bits;
    for (let s = 0; s < rawColorCount; s++) {
      const key = shadeRgb[s];
      const binKey = (((key >> 16) >> shift) << (2 * bits)) | ((((key >> 8) & 255) >> shift) << bits) | ((key & 255) >> shift);
      let bin = binKeys.get(binKey);
      if (bin === undefined) {
        bin = binKeys.size;
        binKeys.set(binKey, bin);
      }
      shadeBin[s] = bin;
    }
    if (binKeys.size <= rules.maxWorkingBins || bits <= 1) break;
  }
  const bins: Bin[] = Array.from({ length: binKeys.size }, () => ({ area: 0, lab: { l: 0, a: 0, b: 0 }, rgb: [0, 0, 0], shades: [] }));
  for (let s = 0; s < rawColorCount; s++) {
    const bin = bins[shadeBin[s]];
    const area = shadeArea[s];
    const key = shadeRgb[s];
    bin.area += area;
    bin.lab.l += shadeLab[s].l * area;
    bin.lab.a += shadeLab[s].a * area;
    bin.lab.b += shadeLab[s].b * area;
    bin.rgb[0] += (key >> 16) * area;
    bin.rgb[1] += ((key >> 8) & 255) * area;
    bin.rgb[2] += (key & 255) * area;
    bin.shades.push(s);
  }
  for (const bin of bins) {
    if (bin.area <= 0) continue;
    bin.lab = { l: bin.lab.l / bin.area, a: bin.lab.a / bin.area, b: bin.lab.b / bin.area };
    bin.rgb = [bin.rgb[0] / bin.area, bin.rgb[1] / bin.area, bin.rgb[2] / bin.area];
  }
  // Deterministic order: largest bin first (ties by first appearance).
  const binOrder = bins.map((_, i) => i).filter((i) => bins[i].area > 0).sort((a, b) => bins[b].area - bins[a].area || a - b);

  // 3. Agglomerative merge; 4. anti-aliased edges.
  let clusters = mergeClusters(binOrder.map((i) => clusterOf([i], bins)), bins, tolerance);
  if (tolerance > 0) clusters = attributeEdgeShades(clusters, bins, paperColor, rules);

  // 5. Minor colours → nearest listed colour within the absorb radius, else "other".
  const share = (cluster: Cluster) => (inkArea > 0 ? cluster.area / inkArea : 0);
  const byArea = (a: Cluster, b: Cluster) => b.area - a.area || a.bins[0] - b.bins[0];
  const major = clusters.filter((cluster) => share(cluster) >= minAreaShare).sort(byArea);
  const minor = clusters.filter((cluster) => share(cluster) < minAreaShare).sort(byArea);
  const absorbed = major.map((cluster) => [...cluster.bins]);
  const other: Cluster[] = [];
  const absorbRadius = tolerance * rules.minorAbsorbFactor;
  for (const cluster of minor) {
    let target = -1;
    let bestDistance = absorbRadius;
    major.forEach((candidate, index) => {
      const d = deltaE2000(cluster.lab, candidate.lab);
      if (d <= bestDistance) {
        bestDistance = d;
        target = index;
      }
    });
    if (target >= 0) absorbed[target].push(...cluster.bins);
    else other.push(cluster);
  }
  const merged = absorbed.map((binIndices) => clusterOf(binIndices, bins)).sort(byArea);
  const listed = merged.slice(0, Math.max(0, rules.maxColors));
  other.push(...merged.slice(listed.length));

  // 6. Representative colour: a real sampled shade (see the file comment).
  const snapRadius = Math.max(2, tolerance / 2);
  const representative = (cluster: Cluster): number => {
    let best = -1;
    let bestArea = -1;
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const binIndex of cluster.bins) {
      for (const s of bins[binIndex].shades) {
        const d = deltaE2000(shadeLab[s], cluster.lab);
        if (d < nearestDistance || (d === nearestDistance && s < nearest)) {
          nearestDistance = d;
          nearest = s;
        }
        if (d <= snapRadius && (shadeArea[s] > bestArea || (shadeArea[s] === bestArea && s < best))) {
          bestArea = shadeArea[s];
          best = s;
        }
      }
    }
    return best >= 0 ? best : nearest;
  };

  const pantones = (input.pantoneColors ?? []).map((color) => {
    const rgb = hexToRgb(color.hex) ?? { r: 0, g: 0, b: 0 };
    return { code: color.code, hex: color.hex, lab: rgbToLab(rgb.r, rgb.g, rgb.b) };
  });
  const ratio = (area: number) => (sheetArea > 0 ? area / sheetArea : 0);

  const colors: ArtworkColor[] = listed.map((cluster) => {
    const s = representative(cluster);
    const key = shadeRgb[s];
    const lab = shadeLab[s];
    let match: (typeof pantones)[number] | null = null;
    let matchDistance = Number.POSITIVE_INFINITY;
    for (const pantone of pantones) {
      const d = deltaE76(lab, pantone.lab);
      if (d < matchDistance) {
        matchDistance = d;
        match = pantone;
      }
    }
    return {
      hex: rgbToHex({ r: key >> 16, g: (key >> 8) & 255, b: key & 255 }),
      lab,
      area: cluster.area,
      sheetRatio: ratio(cluster.area),
      inkShare: share(cluster),
      shadeCount: cluster.bins.reduce((sum, binIndex) => sum + bins[binIndex].shades.length, 0),
      pantone: match ? { code: match.code, hex: match.hex, deltaE: matchDistance } : null,
    };
  });
  const listedArea = colors.reduce((sum, color) => sum + color.area, 0);
  const otherArea = Math.max(0, inkArea - listedArea);

  return {
    sheetArea,
    inkArea,
    sheetRatio: ratio(inkArea),
    colors,
    other: { area: otherArea, sheetRatio: ratio(otherArea), colorCount: other.length },
    rawColorCount,
    settings,
  };
}
