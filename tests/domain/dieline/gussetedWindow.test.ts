import { describe, expect, it } from 'vitest';
import { getBagWeight } from '../../../src/domain/bagWeight';
import { buildDieline, getArtworkClipHoles, getArtworkClipRect } from '../../../src/domain/dieline';
import { createConfiguration } from '../../../src/domain/factories';
import type { BagWindow } from '../../../src/domain/types';

// Client example 140 + 90 × 370, s = 15, d = 25 (sheet 475 × 395, FRONT column x ∈ [90, 230], bottom line y = 25).
const dimensions = { width: 140, height: 370, depth: 90 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'PP', width: 40, filmOverlap: 10 };
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'PP_PERFORATED', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const dieline = (window: BagWindow | null) => buildDieline({ ...createConfiguration('FOLDED'), dimensions, window });

describe('gusseted dieline with a panoramic window', () => {
  const d = dieline(panoramic);

  it('cuts a U notch through the top edge of FRONT (part of the outer outline, no inner contour)', () => {
    // Opening x ∈ [50, 90] on FRONT → sheet [140, 180]; lower edge d + m = 40 → sheet y = 65; open up to the mouth.
    expect(d.cuts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 475, y: 0 },
        { x: 475, y: 395 },
        { x: 180, y: 395 },
        { x: 180, y: 65 },
        { x: 140, y: 65 },
        { x: 140, y: 395 },
        { x: 0, y: 395 },
      ],
    ]);
    expect(d.windows).toEqual([
      {
        id: 'window',
        type: 'PANORAMIC',
        material: 'PP',
        panel: 'FRONT',
        segment: 'FRONT',
        openAtTop: true,
        filmOverlap: 10,
        opening: { x: 140, y: 65, width: 40, height: 330 },
        film: { x: 130, y: 55, width: 60, height: 340 },
        localOpening: { x: 50, y: 40, width: 40, height: 330 },
        localFilm: { x: 40, y: 30, width: 60, height: 340 },
      },
    ]);
  });

  it('marks the opening and the film glued on the inside as separate zones', () => {
    expect(d.zones.find((z) => z.kind === 'WINDOW_OPENING')).toMatchObject({ rect: { x: 140, y: 65, width: 40, height: 330 } });
    expect(d.zones.find((z) => z.kind === 'WINDOW_FILM')).toMatchObject({ face: 'REVERSE', rect: { x: 130, y: 55, width: 60, height: 340 } });
  });

  it('keeps artwork out of the opening, over the bleed above the top edge too', () => {
    const front = d.segments.find((s) => s.panel === 'FRONT')!;
    const clip = getArtworkClipRect(d, front);
    expect(getArtworkClipHoles(d, front)).toEqual([{ x: 140, y: 65, width: 40, height: clip.y + clip.height - 65 }]);
    expect(clip.y + clip.height).toBe(398); // sheet top + 3 mm bleed
    for (const other of d.segments.filter((s) => s.panel !== 'FRONT')) expect(getArtworkClipHoles(d, other)).toEqual([]);
  });

  it('removes the opening from the paper blank; the film is reported apart and does not weigh', () => {
    const configuration = { ...createConfiguration('FOLDED'), dimensions, window: panoramic };
    const weight = getBagWeight(configuration);
    expect(weight.blankAreaM2).toBeCloseTo((475 * 395 - 40 * 330) / 1e6, 9);
    expect(weight.grams).toBeCloseTo(weight.blankAreaM2 * 40, 9);
    expect(weight.windowFilmAreaM2).toBeCloseTo((60 * 340) / 1e6, 9);
    expect(getBagWeight({ ...configuration, window: null }).windowFilmAreaM2).toBe(0);
  });
});

describe('gusseted dieline with a rectangular window', () => {
  const d = dieline(rectangle);

  it('keeps the outline and adds the opening as an inner cut contour', () => {
    expect(d.cuts[0]).toHaveLength(4);
    // Opening x ∈ [40, 100] → sheet [130, 190]; y ∈ [150, 250] → sheet [175, 275].
    expect(d.cuts[1]).toEqual([
      { x: 130, y: 175 },
      { x: 130, y: 275 },
      { x: 190, y: 275 },
      { x: 190, y: 175 },
    ]);
    expect(d.windows[0]).toMatchObject({ openAtTop: false, film: { x: 120, y: 165, width: 80, height: 120 } });
    expect(getBagWeight({ ...createConfiguration('FOLDED'), dimensions, window: rectangle }).blankAreaM2).toBeCloseTo(
      (475 * 395 - 60 * 100) / 1e6,
      9,
    );
  });

  it('clips artwork only inside the opening', () => {
    const front = d.segments.find((s) => s.panel === 'FRONT')!;
    expect(getArtworkClipHoles(d, front)).toEqual([{ x: 130, y: 175, width: 60, height: 100 }]);
  });
});

describe('no window', () => {
  it('leaves the gusseted and the block dieline unchanged', () => {
    expect(dieline(null).windows).toEqual([]);
    expect(dieline(null).cuts).toHaveLength(1);
    expect(buildDieline({ dimensions: { width: 200, height: 400, depth: 150 }, handle: null, window: rectangle }).windows).toEqual([]);
  });
});
