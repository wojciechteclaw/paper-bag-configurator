import { describe, expect, it } from 'vitest';
import { resolvePanelArtworks, wrapLayerTarget } from '../domain/artworkLayout';
import { containPlacement, fillPlacement } from '../domain/artworkPlacement';
import { buildDieline } from '../domain/dieline';
import { createArtwork, createConfiguration, createWrapLayer } from '../domain/factories';
import type { Artwork, ArtworkPlacement } from '../domain/types';
import { buildDielineSvg } from './exportSvg';
import { buildDielineScene, DIMENSION_TEXT_SIZE, isPointOnSceneImage } from './scene';

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
  return buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
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
    // Sheet 710 × 490 + margins 51/8 → viewBox and physical size agree 1:1.
    expect(root.getAttribute('viewBox')).toBe('-51 -51 769 549');
    expect(root.getAttribute('width')).toBe('769mm');
    expect(root.getAttribute('height')).toBe('549mm');
    const layers = [...root.querySelectorAll('g[id]')].filter((g) => g.parentElement === root);
    expect(layers.map((g) => [g.id, g.getAttribute('inkscape:label')])).toEqual([
      ['print', 'print'],
      ['annotations', 'annotations'],
      ['glue', 'glue'],
      ['crease_valley', 'crease_valley'],
      ['crease_mountain', 'crease_mountain'],
      ['cut', 'cut'],
    ]);
    // Sheet outline with the glue flap chamfered 45° at both ends [K] (SVG y down: tube end at 490), red stroke.
    const cut = root.querySelector('#cut path')!;
    expect(cut.getAttribute('d')).toBe('M0 490 L700 490 L710 480 L710 10 L700 0 L0 0 Z');
    expect(cut.getAttribute('stroke')).toBe('#e1001a');
    const valley = [...root.querySelectorAll('#crease_valley line')];
    const mountain = [...root.querySelectorAll('#crease_mountain line')];
    expect(valley.length + mountain.length).toBeGreaterThan(10);
    expect(valley.every((l) => l.getAttribute('data-kind') === 'VALLEY')).toBe(true);
    expect(mountain.every((l) => l.getAttribute('data-kind') === 'MOUNTAIN')).toBe(true);
    // Gusset centre (C4) and 45° diagonals (C6) are mountains; tube edges (C2) and the bottom line (C1) valleys.
    expect(mountain.map((l) => l.getAttribute('data-code'))).toEqual(expect.arrayContaining(['C4', 'C6']));
    expect(valley.map((l) => l.getAttribute('data-code'))).toEqual(expect.arrayContaining(['C1', 'C2', 'C3', 'C9']));
    // Tube corner edges continued into the bottom zone are mountains (turned-over corner triangle under the side flap).
    expect(mountain.map((l) => l.getAttribute('data-code'))).toEqual(expect.arrayContaining(['C2', 'C3']));
    expect(root.querySelector('#bottom-flap-glue-FRONT')?.tagName).toBe('polygon');
    // Distinguishable styles.
    expect(valley[0].getAttribute('stroke-dasharray')).not.toBe(mountain[0].getAttribute('stroke-dasharray'));
    // Glue layer: chamfered glue flap polygon + bottom glue bands (print side on FRONT, inside face on BACK).
    expect(root.querySelector('#glue polygon#glue-flap')?.getAttribute('points')).toBe('700,490 710,480 710,10 700,0');
    expect(root.querySelector('#bottom-flap-glue-FRONT')?.getAttribute('data-face')).toBe('PRINT');
    expect(root.querySelector('#bottom-flap-glue-BACK')?.getAttribute('data-face')).toBe('REVERSE');
    expect(root.querySelector('#bottom-flap-glue-BACK')?.getAttribute('fill')).toBe('none');
    expect(root.querySelector('title')?.textContent).toBe('Bag <1>');
  });

  it('embeds artwork (replaced hrefs), clipped per panel column', () => {
    const svg = buildDielineSvg(scene(), { hrefs: { 'blob:front': 'data:image/png;base64,AAAA' } });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const images = [...doc.querySelectorAll('#print image')];
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
    const images = buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
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

  it('stretches FILL over wall + bottom allowance and clips into the allowance only when extended (SPEC §4f)', () => {
    const build = (extendToBottom: boolean) => {
      const configuration = createConfiguration('BLOCK');
      configuration.panels.FRONT.artwork = createArtwork({
        fileName: 'f.png',
        fileUrl: 'blob:front',
        mimeType: 'image/png',
        width: 100,
        height: 100,
        sizeBytes: 1,
      });
      configuration.panels.FRONT.placement = fillPlacement(extendToBottom);
      const images = buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
        label: (key) => key,
        dimension: (key) => key,
      }).images;
      return images.find((image) => image.segment === 'FRONT')!;
    };
    const ys = (image: ReturnType<typeof build>) => image.corners.map(([, y]) => y);
    const plain = build(false);
    // SVG y: sheet top = 0, bottom line = 400, tube end = 490.
    expect([Math.min(...ys(plain)), Math.max(...ys(plain))]).toEqual([0, 400]);
    expect(plain.clip).toMatchObject({ y: -3, height: 405 });
    const extended = build(true);
    expect([Math.min(...ys(extended)), Math.max(...ys(extended))]).toEqual([0, 490]);
    expect(extended.clip).toMatchObject({ y: -3, height: 496 });
    expect(extended.area).toMatchObject({ x: 150, y: 0, width: 200, height: 490 });
});  it('marks which bottom allowances carry artwork (printed) and which stay bare paper', () => {    const configuration = createConfiguration('BLOCK');    configuration.panels.FRONT.artwork = createArtwork({ fileName: 'f.png', fileUrl: 'blob:f', mimeType: 'image/png', width: 10, height: 10, sizeBytes: 1 });    configuration.panels.FRONT.placement = fillPlacement(true);    configuration.panels.BACK.artwork = { ...configuration.panels.FRONT.artwork, id: 'b', fileUrl: 'blob:b' };    const scene = buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), { label: (k) => k, dimension: (k) => k });    expect(scene.allowances.map((a) => [a.segment, a.printed])).toEqual([      ['LEFT', false],      ['FRONT', true],      ['RIGHT', false],      ['BACK', false],    ]);    expect(scene.allowances[1]).toMatchObject({ x: 150, y: 400, width: 200, height: 90 });    expect(scene.zones.some((z) => z.kind === 'BOTTOM_ALLOWANCE')).toBe(false);    const doc = new DOMParser().parseFromString(buildDielineSvg(scene), 'image/svg+xml');    expect(doc.querySelector('#allowance-FRONT')?.getAttribute('data-printed')).toBe('true');    expect(doc.querySelector('#allowance-FRONT')?.getAttribute('fill')).toBe('none');    expect(doc.querySelector('#allowance-BACK')?.getAttribute('fill')).toContain('rgba');
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

describe('dieline annotations (client feedback)', () => {
  const configuration = createConfiguration('BLOCK');
  const scene = buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
    label: (key) => key,
    dimension: (key) => key,
  });

  it('draws dimensions with the enlarged (5×) text', () => {
    expect(DIMENSION_TEXT_SIZE).toBe(17.5);
    expect(scene.dimensions.length).toBeGreaterThan(0);
    expect(scene.dimensions.every((d) => d.text.size === DIMENSION_TEXT_SIZE)).toBe(true);
  });

  it('keeps every dimension text inside the sheet extent and the two tiers apart', () => {
    const approxLength = (text: string) => text.length * DIMENSION_TEXT_SIZE * 0.56;
    for (const d of scene.dimensions) {
      const length = approxLength(d.text.text);
      if (d.text.rotate) {
        expect(d.text.y - length / 2).toBeGreaterThanOrEqual(-0.001);
        expect(d.text.y + length / 2).toBeLessThanOrEqual(scene.sheet.height + 0.001);
      } else {
        expect(d.text.x - length / 2).toBeGreaterThanOrEqual(-0.001);
        expect(d.text.x + length / 2).toBeLessThanOrEqual(scene.sheet.width + 0.001);
      }
    }
    const width = scene.dimensions.find((d) => d.key === 'width')!;
    const sheetWidth = scene.dimensions.find((d) => d.key === 'sheetWidth')!;
    // Outer tier line sits above the inner tier text (baseline − cap height).
    expect(width.text.y - DIMENSION_TEXT_SIZE * 0.75).toBeGreaterThan(sheetWidth.line.y1);
    // The whole outer tier text fits in the drawing (viewBox top).
    expect(sheetWidth.text.y - DIMENSION_TEXT_SIZE * 0.75).toBeGreaterThanOrEqual(scene.viewBox[1]);
  });

  it('labels only the panels — no allowance / flap / glue flap descriptions', () => {
    expect(scene.labels.map((l) => l.text).sort()).toEqual(['BACK', 'FRONT', 'LEFT', 'RIGHT']);
  });
});


describe('whole-bag artwork layers on the dieline (SPEC §3a, §3b)', () => {
  const image = (name: string, width: number, height: number) =>
    createArtwork({ fileName: `${name}.png`, fileUrl: `blob:${name}`, mimeType: 'image/png', width, height, sizeBytes: 1 });

  /** 200 × 400 × 150: wrap 700 mm from FRONT's left edge; sheet columns LEFT 0–150 | FRONT | RIGHT | BACK 500–700 | glue. */
  function wrapScene(layers: { artwork: Artwork; placement: ArtworkPlacement }[]) {
    const configuration = createConfiguration('BLOCK');
    configuration.panels.FRONT.artwork = image('kept', 10, 10); // inactive layout: not drawn
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = layers.map(({ artwork, placement }) => createWrapLayer(artwork, placement));
    const scene = buildDielineScene(buildDieline(configuration), resolvePanelArtworks(configuration), {
      label: (k) => k,
      dimension: (k) => k,
    });
    return { scene, ids: configuration.wrapLayers.map((layer) => layer.id) };
  }

  const xRange = (corners: [number, number][]) => [Math.min(...corners.map(([x]) => x)), Math.max(...corners.map(([x]) => x))];

  it('splits a FILL layer at the LEFT | FRONT boundary: FRONT…BACK show the start, the LEFT column the end', () => {
    const { scene, ids } = wrapScene([{ artwork: image('wrap', 1400, 800), placement: fillPlacement() }]);
    expect(scene.images).toHaveLength(2);
    const left = scene.images.find((i) => i.id === `artwork-WRAP-${ids[0]}-LEFT`)!;
    const main = scene.images.find((i) => i.id === `artwork-WRAP-${ids[0]}`)!;
    for (const part of [left, main]) expect(part).toMatchObject({ target: wrapLayerTarget(ids[0]), segment: 'WRAP', href: 'blob:wrap' });
    // Main part: wrap x 0 at FRONT's left edge (sheet 150), clipped from FRONT (−2 mm overprint) to the glue-flap hinge (+2).
    expect(xRange(main.corners)).toEqual([150, 850]);
    expect(main.clip).toMatchObject({ x: 148, width: 554 });
    expect(main.area).toMatchObject({ x: 150, y: 0, width: 550, height: 400 });
    // LEFT part: the same image shifted by the wrap width, so the wrap's last 150 mm land on LEFT.
    expect(xRange(left.corners)).toEqual([-550, 150]);
    expect(left.clip).toMatchObject({ x: -3, width: 155 });
    expect(left.area).toMatchObject({ x: 0, width: 150 });
    expect(scene.allowances.every((a) => !a.printed)).toBe(true);
  });

  it('embeds a file drawn twice only once (<image> in <defs>, placed with <use>)', () => {
    const { scene } = wrapScene([
      { artwork: image('wrap', 1400, 800), placement: fillPlacement() },
      { artwork: image('logo', 100, 100), placement: { mode: 'CUSTOM', offsetX: -250, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false } },
    ]);
    const svg = buildDielineSvg(scene);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelectorAll('parsererror')).toHaveLength(0);
    expect(doc.querySelectorAll('image')).toHaveLength(2); // background once (shared) + logo
    expect(doc.querySelectorAll('defs image')).toHaveLength(1);
    expect(doc.querySelectorAll('use')).toHaveLength(2);
    expect(svg.split('blob:wrap').length - 1).toBe(2); // href + xlink:href of the one shared <image>
  });

  it('draws layers bottom → top and leaves out copies that are not visible in their column', () => {
    const { scene, ids } = wrapScene([
      { artwork: image('bg', 1400, 800), placement: fillPlacement() },
      // 100 mm logo centred at wrap x 100 (FRONT only): no LEFT copy.
      { artwork: image('logo', 100, 100), placement: { mode: 'CUSTOM', offsetX: -250, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false } },
      // 100 mm badge centred at wrap x 625 (on LEFT): only the LEFT copy.
      { artwork: image('badge', 100, 100), placement: { mode: 'CUSTOM', offsetX: 275, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false } },
    ]);
    expect(scene.images.map((i) => i.id)).toEqual([
      `artwork-WRAP-${ids[0]}-LEFT`,
      `artwork-WRAP-${ids[0]}`,
      `artwork-WRAP-${ids[1]}`,
      `artwork-WRAP-${ids[2]}-LEFT`,
    ]);
    const badge = scene.images[3];
    expect(xRange(badge.corners)).toEqual([25, 125]);
  });

  it('gives each layer its own bottom extension; an extended layer marks every allowance printed', () => {
    const { scene } = wrapScene([
      { artwork: image('bg', 1400, 800), placement: fillPlacement(true) },
      { artwork: image('logo', 100, 100), placement: { mode: 'CUSTOM', offsetX: -250, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false } },
    ]);
    const [, bg, logo] = scene.images;
    expect(bg.area).toMatchObject({ y: 0, height: 490 });
    expect(bg.extendToBottom).toBe(true);
    expect(logo.extendToBottom).toBe(false);
    expect(logo.clip.y + logo.clip.height).toBeCloseTo(402); // bottom line (SVG y 400) + 2 mm overprint
    expect(scene.allowances.every((a) => a.printed)).toBe(true);
  });
});

describe('isPointOnSceneImage', () => {
  const image = {
    clip: { id: 'c', x: 0, y: 0, width: 100, height: 100 },
    corners: [
      [10, 10],
      [60, 10],
      [60, 40],
      [10, 40],
    ] as [number, number][],
  };

  it('is true inside the outline and the clip, false outside either', () => {
    expect(isPointOnSceneImage(image, [30, 20])).toBe(true);
    expect(isPointOnSceneImage(image, [70, 20])).toBe(false); // outside the outline
    expect(isPointOnSceneImage({ ...image, clip: { ...image.clip, width: 20 } }, [30, 20])).toBe(false); // clipped away
  });
});
