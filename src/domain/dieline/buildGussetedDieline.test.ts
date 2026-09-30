import { describe, expect, it } from 'vitest';
import { BAG_TYPES, GUSSETED_BAG_RULES } from '../config/productCatalog';
import { createConfiguration } from '../factories';
import { buildDieline, panelToSheet, sheetToPanel } from './buildDieline';
import { buildGussetedDieline, GUSSETED_BOTTOM_FOLD } from './buildGussetedDieline';

// Client guideline example [K]: 140 + 90 × 370, s = 15, d = 25 → B = 475, L = 395, creases at
// x = 70, 115, 160, 300, 345, 390, 460.
const dimensions = { width: 140, height: 370, depth: 90 };
const d = GUSSETED_BAG_RULES.bottomFoldDepth;
const s = BAG_TYPES.FOLDED.glueFlap.default;
const dieline = buildGussetedDieline({ dimensions });

describe('buildGussetedDieline (client guideline example)', () => {
  it('uses the client defaults s = 15 and d = 25', () => {
    expect([s, d]).toEqual([15, 25]);
  });

  it('lays out the blank B × L = (2W + 2F + s) × (H + d) with the seam in the middle of BACK', () => {
    expect(dieline.sheet).toEqual({ width: 475, height: 395 });
    expect(dieline.allowance).toBe(d);
    expect(dieline.bottomLineY).toBe(d);
    expect(dieline.seamOffset).toBe(70);
    expect(dieline.segments.map(({ id, panel, x0, x1, localX0 }) => [id, panel, x0, x1, localX0])).toEqual([
      ['BACK_LEFT_HALF', 'BACK', 0, 70, 70],
      ['LEFT', 'LEFT', 70, 160, 0],
      ['FRONT', 'FRONT', 160, 300, 0],
      ['RIGHT', 'RIGHT', 300, 390, 0],
      ['BACK_RIGHT_HALF', 'BACK', 390, 460, 0],
    ]);
    expect(dieline.glueFlap).toEqual({ x: 460, y: 0, width: 15, height: 395 });
    expect(dieline.cuts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 475, y: 0 },
        { x: 475, y: 395 },
        { x: 0, y: 395 },
      ],
    ]);
    expect(dieline.handlePatches).toEqual([]);
  });

  it('puts the vertical creases at the client positions: sides fold out, gusset centres fold in', () => {
    const vertical = dieline.creases.filter((c) => c.code !== 'C1');
    expect(vertical.map((c) => c.from.x).sort((a, b) => a - b)).toEqual([70, 115, 160, 300, 345, 390, 460]);
    for (const crease of vertical) {
      expect(crease.from.x).toBe(crease.to.x);
      expect([crease.from.y, crease.to.y]).toEqual([0, 395]);
      expect(crease.kind).toBe(crease.code === 'C4' ? 'MOUNTAIN' : 'VALLEY');
    }
    expect(dieline.creases.filter((c) => c.code === 'C4').map((c) => c.from.x)).toEqual([115, 345]);
    expect(new Set(dieline.creases.map((c) => c.code))).toEqual(new Set(['C1', 'C2', 'C3', 'C4']));
  });

  it('maps both BACK halves to one continuous BACK wall', () => {
    const [start, , , , end] = dieline.segments;
    // BACK x = 0 … 70 at the end of the sheet, x = 70 … 140 at its start.
    expect(sheetToPanel(end, d, { x: 390, y: d })).toEqual({ x: 0, y: 0 });
    expect(sheetToPanel(start, d, { x: 0, y: d })).toEqual({ x: 70, y: 0 });
    expect(panelToSheet(start, d, { x: 140, y: 0 })).toEqual({ x: 70, y: d });
  });

  it('folds the bottom strip TO THE BACK: C1 is MOUNTAIN where the print side faces the BACK side', () => {
    const c1 = dieline.creases.filter((c) => c.code === 'C1');
    expect(c1.every((c) => c.from.y === d && c.to.y === d)).toBe(true);
    expect(c1[0].from.x).toBe(0);
    c1.slice(1).forEach((c, i) => expect(c.from.x).toBe(c1[i].to.x));
    expect(c1[c1.length - 1].to.x).toBe(475);
    expect(c1.map((c) => [c.id, c.kind])).toEqual([
      ['C1-BACK-1', 'MOUNTAIN'],
      ['C1-LEFT-1', 'VALLEY'],
      ['C1-LEFT-2', 'MOUNTAIN'],
      ['C1-FRONT', 'VALLEY'],
      ['C1-RIGHT-1', 'MOUNTAIN'],
      ['C1-RIGHT-2', 'VALLEY'],
      ['C1-BACK-2', 'MOUNTAIN'],
      ['C1-GLUE', 'MOUNTAIN'],
    ]);
    expect(GUSSETED_BOTTOM_FOLD).toEqual({
      FRONT: 'VALLEY',
      BACK: 'MOUNTAIN',
      GUSSET_NEXT_TO_FRONT: 'MOUNTAIN',
      GUSSET_NEXT_TO_BACK: 'VALLEY',
      GLUE_FLAP: 'MOUNTAIN',
    });
  });

  it('glues the strip on BACK, keeps the print area W × (H − d) inside the safety zones', () => {
    const zone = (id: string) => dieline.zones.find((z) => z.id === id);
    expect(zone('bleed')?.rect).toEqual({ x: -3, y: -3, width: 463, height: 401 });
    expect(zone('bottom-allowance')?.rect).toEqual({ x: 0, y: 0, width: 460, height: d });
    expect(zone('glue-flap')?.kind).toBe('GLUE_FLAP');
    expect(zone('bottom-flap-glue-BACK_LEFT_HALF')).toMatchObject({ kind: 'BOTTOM_FLAP_GLUE', face: 'PRINT', rect: { x: 0, y: 0, width: 70, height: d } });
    expect(zone('bottom-flap-glue-BACK_RIGHT_HALF')?.rect).toEqual({ x: 390, y: 0, width: 70, height: d });
    // Every safety area starts above the strip band (y ≥ 2d + 6) and keeps 6 mm from the top cut.
    const safety = dieline.zones.filter((z) => z.kind === 'SAFETY');
    expect(safety.map((z) => z.id)).toEqual([
      'safety-BACK_LEFT_HALF',
      'safety-LEFT-1',
      'safety-LEFT-2',
      'safety-FRONT',
      'safety-RIGHT-1',
      'safety-RIGHT-2',
      'safety-BACK_RIGHT_HALF',
    ]);
    for (const z of safety) {
      expect(z.rect.y).toBe(2 * d + 6);
      expect(z.rect.y + z.rect.height).toBe(395 - 6);
    }
    expect(zone('safety-FRONT')?.rect).toMatchObject({ x: 165, width: 130 });
  });

  it('annotates W, F, H, d, s and the blank', () => {
    const value = (key: string) => dieline.annotations.find((a) => a.key === key)?.value;
    expect([value('width'), value('depth'), value('height'), value('allowance'), value('glueFlap')]).toEqual([140, 90, 370, 25, 15]);
    expect([value('sheetWidth'), value('sheetHeight')]).toEqual([475, 395]);
  });

  it('is what buildDieline returns for a FOLDED configuration (the block bottom stays the default)', () => {
    expect(buildDieline({ ...createConfiguration('FOLDED'), dimensions })).toEqual(dieline);
    expect(buildDieline({ dimensions, handle: null }).segments.map((segment) => segment.id)).toEqual(['LEFT', 'FRONT', 'RIGHT', 'BACK']);
  });
});
