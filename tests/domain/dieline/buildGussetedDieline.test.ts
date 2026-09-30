import { describe, expect, it } from 'vitest';
import { BAG_TYPES, GUSSETED_BAG_RULES } from '../../../src/domain/config/productCatalog';
import { createConfiguration } from '../../../src/domain/factories';
import { buildDieline, panelToSheet, sheetToPanel } from '../../../src/domain/dieline/buildDieline';
import { buildGussetedDieline, GUSSETED_BOTTOM_FOLD } from '../../../src/domain/dieline/buildGussetedDieline';

// Client guideline example [K]: 140 + 90 × 370, s = 15, d = 25 → B = 475, L = 395. Column order like the block bottom
// (client decision 30.09.2026): LEFT | FRONT | RIGHT | BACK | s → creases after F/2, F/2, W, F/2, F/2, W at
// x = 45, 90, 230, 275, 320, 460.
const dimensions = { width: 140, height: 370, depth: 90 };
const d = GUSSETED_BAG_RULES.bottomFoldDepth;
const s = BAG_TYPES.FOLDED.glueFlap.default;
const dieline = buildGussetedDieline({ dimensions });

describe('buildGussetedDieline (client guideline example)', () => {
  it('uses the client defaults s = 15 and d = 25', () => {
    expect([s, d]).toEqual([15, 25]);
  });

  it('lays out the blank B × L = (2W + 2F + s) × (H + d) in the block-bottom column order, seam on the BACK / LEFT edge', () => {
    expect(dieline.sheet).toEqual({ width: 475, height: 395 });
    expect(dieline.allowance).toBe(d);
    expect(dieline.bottomLineY).toBe(d);
    expect(dieline.seamOffset).toBe(140);
    expect(dieline.segments.map(({ id, panel, x0, x1, localX0 }) => [id, panel, x0, x1, localX0])).toEqual([
      ['LEFT', 'LEFT', 0, 90, 0],
      ['FRONT', 'FRONT', 90, 230, 0],
      ['RIGHT', 'RIGHT', 230, 320, 0],
      ['BACK', 'BACK', 320, 460, 0],
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
    // F/2 = 45, F = 90, F + W = 230, … — the free sheet edge x = 0 is a cut, not a crease.
    expect(vertical.map((c) => c.from.x).sort((a, b) => a - b)).toEqual([45, 90, 230, 275, 320, 460]);
    for (const crease of vertical) {
      expect(crease.from.x).toBe(crease.to.x);
      expect([crease.from.y, crease.to.y]).toEqual([0, 395]);
      expect(crease.kind).toBe(crease.code === 'C4' ? 'MOUNTAIN' : 'VALLEY');
    }
    expect(dieline.creases.filter((c) => c.code === 'C4').map((c) => c.from.x)).toEqual([45, 275]);
    expect(dieline.creases.filter((c) => c.code === 'C2').map((c) => c.from.x)).toEqual([90, 230, 320]);
    expect(dieline.creases.filter((c) => c.code === 'C3').map((c) => c.from.x)).toEqual([460]);
    expect(new Set(dieline.creases.map((c) => c.code))).toEqual(new Set(['C1', 'C2', 'C3', 'C4']));
  });

  it('maps every wall as one whole column (BACK is not split)', () => {
    const back = dieline.segments.find((segment) => segment.panel === 'BACK')!;
    expect(dieline.segments.filter((segment) => segment.panel === 'BACK')).toHaveLength(1);
    expect(sheetToPanel(back, d, { x: 320, y: d })).toEqual({ x: 0, y: 0 });
    expect(panelToSheet(back, d, { x: 140, y: 0 })).toEqual({ x: 460, y: d });
  });

  it('folds the bottom strip TO THE BACK: C1 is MOUNTAIN where the print side faces the BACK side', () => {
    const c1 = dieline.creases.filter((c) => c.code === 'C1');
    expect(c1.every((c) => c.from.y === d && c.to.y === d)).toBe(true);
    expect(c1[0].from.x).toBe(0);
    c1.slice(1).forEach((c, i) => expect(c.from.x).toBe(c1[i].to.x));
    expect(c1[c1.length - 1].to.x).toBe(475);
    expect(c1.map((c) => [c.id, c.from.x, c.to.x, c.kind])).toEqual([
      ['C1-LEFT-1', 0, 45, 'VALLEY'],
      ['C1-LEFT-2', 45, 90, 'MOUNTAIN'],
      ['C1-FRONT', 90, 230, 'VALLEY'],
      ['C1-RIGHT-1', 230, 275, 'MOUNTAIN'],
      ['C1-RIGHT-2', 275, 320, 'VALLEY'],
      ['C1-BACK', 320, 460, 'MOUNTAIN'],
      // The seam flap lies turned over inside LEFT's half next to BACK, print side towards FRONT.
      ['C1-GLUE', 460, 475, 'VALLEY'],
    ]);
    expect(GUSSETED_BOTTOM_FOLD).toEqual({
      FRONT: 'VALLEY',
      BACK: 'MOUNTAIN',
      GUSSET_NEXT_TO_FRONT: 'MOUNTAIN',
      GUSSET_NEXT_TO_BACK: 'VALLEY',
      GLUE_FLAP: 'VALLEY',
    });
  });

  it('glues the strip on BACK, keeps the print area W × (H − d) inside the safety zones', () => {
    const zone = (id: string) => dieline.zones.find((z) => z.id === id);
    expect(zone('bleed')?.rect).toEqual({ x: -3, y: -3, width: 463, height: 401 });
    expect(zone('bottom-allowance')?.rect).toEqual({ x: 0, y: 0, width: 460, height: d });
    expect(zone('glue-flap')?.kind).toBe('GLUE_FLAP');
    expect(zone('bottom-flap-glue-BACK')).toMatchObject({ kind: 'BOTTOM_FLAP_GLUE', face: 'PRINT', rect: { x: 320, y: 0, width: 140, height: d } });
    expect(dieline.zones.filter((z) => z.kind === 'BOTTOM_FLAP_GLUE')).toHaveLength(1);
    // Every safety area starts above the strip band (y ≥ 2d + 6) and keeps 6 mm from the top cut.
    const safety = dieline.zones.filter((z) => z.kind === 'SAFETY');
    expect(safety.map((z) => z.id)).toEqual([
      'safety-LEFT-1',
      'safety-LEFT-2',
      'safety-FRONT',
      'safety-RIGHT-1',
      'safety-RIGHT-2',
      'safety-BACK',
    ]);
    for (const z of safety) {
      expect(z.rect.y).toBe(2 * d + 6);
      expect(z.rect.y + z.rect.height).toBe(395 - 6);
    }
    expect(zone('safety-FRONT')?.rect).toMatchObject({ x: 95, width: 130 });
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
