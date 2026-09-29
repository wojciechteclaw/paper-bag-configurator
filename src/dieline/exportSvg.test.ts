import { describe, expect, it } from 'vitest';
import { containPlacement } from '../domain/artworkPlacement';
import { buildDieline } from '../domain/dieline';
import { createArtwork, createConfiguration } from '../domain/factories';
import { buildDielineSvg } from './exportSvg';
import { buildDielineScene } from './scene';

function scene(withArtwork = true) {
  const configuration = createConfiguration('BLOCK');
  if (withArtwork) {
    configuration.panels.FRONT.artwork = createArtwork({
      fileName: 'f.png',
      fileUrl: 'blob:front',
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      sizeBytes: 1,
    });
    configuration.panels.FRONT.placement = containPlacement();
    configuration.panels.BACK.artwork = { ...configuration.panels.FRONT.artwork, id: 'b', fileUrl: 'blob:back' };
  }
  return buildDielineScene(buildDieline(configuration), configuration.panels, {
    label: (key) => `L:${key}`,
    dimension: (key, value) => `${key}=${value}`,
  });
}

describe('buildDielineSvg', () => {
  it('produces a well-formed 1:1 mm SVG with named layers', () => {
    const svg = buildDielineSvg(scene(), { hrefs: { 'blob:front': 'data:image/png;base64,AAAA' }, title: 'Bag <1>' });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const root = doc.documentElement;
    // Sheet 710 × 490 + margins 34/8 → viewBox and physical size agree 1:1.
    expect(root.getAttribute('viewBox')).toBe('-34 -34 752 532');
    expect(root.getAttribute('width')).toBe('752mm');
    expect(root.getAttribute('height')).toBe('532mm');
    const layers = [...root.querySelectorAll('g[id]')].filter((g) => g.parentElement === root);
    expect(layers.map((g) => [g.id, g.getAttribute('inkscape:label')])).toEqual([
      ['artwork', 'Artwork'],
      ['annotations', 'Annotations'],
      ['crease', 'Crease'],
      ['cut', 'Cut'],
    ]);
    expect(root.querySelector('#cut path')?.getAttribute('d')).toBe('M0 490 L710 490 L710 0 L0 0 Z');
    expect(root.querySelectorAll('#crease line').length).toBeGreaterThan(10);
    expect(root.querySelector('title')?.textContent).toBe('Bag <1>');
  });

  it('embeds artwork (replaced hrefs), clipped per panel column', () => {
    const svg = buildDielineSvg(scene(), { hrefs: { 'blob:front': 'data:image/png;base64,AAAA' } });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const images = [...doc.querySelectorAll('#artwork image')];
    expect(images).toHaveLength(2); // FRONT + BACK (one whole column)
    expect(doc.querySelector('#artwork-FRONT')?.getAttribute('href')).toBe('data:image/png;base64,AAAA');
    // Not embedded → original href kept.
    expect(doc.querySelector('#artwork-BACK')?.getAttribute('href')).toBe('blob:back');
    expect(doc.querySelectorAll('clipPath')).toHaveLength(2);
  });

  it('places a contained square image in the middle of FRONT (same maths as 3D)', () => {
    const front = scene().images.find((image) => image.segment === 'FRONT')!;
    // FRONT: sheet x ∈ [150, 350], wall y ∈ [0, 400] in SVG (sheet top at 0). Square 200 × 200 centred → y ∈ [100, 300].
    const xs = front.corners.map(([x]) => x);
    const ys = front.corners.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(150);
    expect(Math.max(...xs)).toBeCloseTo(350);
    expect(Math.min(...ys)).toBeCloseTo(100);
    expect(Math.max(...ys)).toBeCloseTo(300);
  });

  it('puts side and back artwork on their own columns, not mirrored (panel x runs with sheet x, as seen from outside)', () => {
    const configuration = createConfiguration('BLOCK');
    const art = (url: string) =>
      createArtwork({ fileName: 'a.png', fileUrl: url, mimeType: 'image/png', width: 100, height: 100, sizeBytes: 1 });
    configuration.panels.LEFT.artwork = art('blob:left');
    configuration.panels.BACK.artwork = art('blob:back');
    const images = buildDielineScene(buildDieline(configuration), configuration.panels, {
      label: (key) => key,
      dimension: (key) => key,
    }).images;
    const span = (segment: string) => {
      const image = images.find((i) => i.segment === segment)!;
      const xs = image.corners.map(([x]) => x);
      return { min: Math.min(...xs), max: Math.max(...xs), a: image.matrix.a };
    };
    // FILL: LEFT covers sheet x ∈ [0, 150] (x = 0 = its BACK edge), BACK covers [500, 700]; the image's left edge
    // (ix = 0) sits on the panel's x = 0, like the 3D UV (u = x / width).
    expect(span('LEFT')).toMatchObject({ min: 0, max: 150 });
    expect(span('BACK')).toMatchObject({ min: 500, max: 700 });
    expect(span('LEFT').a).toBeGreaterThan(0);
    expect(span('BACK').a).toBeGreaterThan(0);
    expect(images.find((i) => i.segment === 'LEFT')!.corners[0][0]).toBeCloseTo(0);
    expect(images.find((i) => i.segment === 'BACK')!.corners[0][0]).toBeCloseTo(500);
  });

  it('can leave the artwork layer empty', () => {
    const svg = buildDielineSvg(scene(), { includeArtwork: false });
    expect(svg).not.toContain('<image');
  });
});

describe('PDF text safety', () => {
  it('transliterates Polish letters outside WinAnsi for jsPDF standard fonts', async () => {
    const { toWinAnsi } = await import('./exportPdf');
    expect(toWinAnsi('TYŁ ½ — łatka, PRZÓD, zakładka')).toBe('TYL ½ - latka, PRZÓD, zakladka');
  });
});
