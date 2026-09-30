import { describe, expect, it } from 'vitest';
import { withPdfLayout } from '../../src/dieline/pdfLayout';
import type { DielineScene } from '../../src/dieline/scene';

const scene = {
  sheet: { width: 435, height: 275 },
  viewBox: [-40, -60, 520, 400],
  labels: [{ id: 'label-FRONT', x: 100, y: 100, text: 'PRZÓD', size: 20 }],
  dimensions: [{ id: 'd', key: 'width', line: { x1: 0, y1: 0, x2: 1, y2: 0 }, extensions: [], text: { id: 't', x: 0, y: 0, text: 'W', size: 17 } }],
  segments: [
    { id: 'LEFT', panel: 'LEFT', x0: 0, x1: 60, localX0: 0 },
    { id: 'FRONT', panel: 'FRONT', x0: 60, x1: 210, localX0: 0 },
    { id: 'RIGHT', panel: 'RIGHT', x0: 210, x1: 270, localX0: 0 },
    { id: 'BACK', panel: 'BACK', x0: 270, x1: 420, localX0: 0 },
  ],
} as unknown as DielineScene;

describe('dieline PDF layout (client, 30.09.2026)', () => {
  const pdf = withPdfLayout(scene, {
    header: ['Torba fałdowa 150 + 60 × 250 mm', 'Arkusz 435 × 275 mm'],
    wallName: (panel) => ({ LEFT: 'BOK LEWY', FRONT: 'PRZÓD', RIGHT: 'BOK PRAWY', BACK: 'TYŁ' })[panel],
    glueFlapName: 's',
  });

  it('drops the dimension lines and the panel labels drawn on the sheet', () => {
    expect(pdf.dimensions).toEqual([]);
    expect(pdf.labels.some((label) => label.id === 'label-FRONT')).toBe(false);
  });

  it('writes the parameters above the sheet and each wall name under its column', () => {
    const header = pdf.labels.filter((label) => label.id.startsWith('pdf-header'));
    expect(header.map((label) => label.text)).toEqual(['Torba fałdowa 150 + 60 × 250 mm', 'Arkusz 435 × 275 mm']);
    expect(header.every((label) => label.y < 0)).toBe(true);
    const walls = pdf.labels.filter((label) => label.id.startsWith('pdf-wall-'));
    expect(walls.map((label) => [label.text, label.x])).toEqual([
      ['BOK LEWY', 30],
      ['PRZÓD', 135],
      ['BOK PRAWY', 240],
      ['TYŁ', 345],
      ['s', 427.5],
    ]);
    expect(walls.every((label) => label.y > 275)).toBe(true);
  });

  it('frames the page around the header, the sheet and the wall names', () => {
    const [x, y, w, h] = pdf.viewBox;
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(Math.min(...pdf.labels.map((label) => label.y - label.size)));
    expect(x + w).toBeGreaterThan(435);
    expect(y + h).toBeGreaterThan(Math.max(...pdf.labels.map((label) => label.y)));
  });
});
