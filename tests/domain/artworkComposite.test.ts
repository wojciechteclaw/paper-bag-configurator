import { describe, expect, it } from 'vitest';
import { getCompositeFrame, planArtworkComposite, type CompositeLayerInput } from '../../src/domain/artworkComposite';
import { resolvePanelArtwork } from '../../src/domain/artworkLayout';
import { containPlacement, fillPlacement, type Affine2 } from '../../src/domain/artworkPlacement';
import { createArtwork, createConfiguration, createWrapLayer } from '../../src/domain/factories';
import { getPanelSize } from '../../src/domain/panels';

const image = (name: string, width: number, height: number) =>
  createArtwork({ fileName: name, fileUrl: `blob:${name}`, mimeType: 'image/png', width, height, sizeBytes: 1 });

const apply = (m: Affine2, x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

/** 200 × 400 × 150 bag, WRAP with a background (FILL, extended to the bottom) and a logo (contain, not extended). */
function layeredFront() {
  const configuration = createConfiguration('BLOCK');
  configuration.artworkLayout = 'WRAP';
  configuration.wrapLayers = [
    createWrapLayer(image('bg', 1400, 980), fillPlacement(true)),
    // Logo centred at wrap x 250 = FRONT's centre (FRONT spans wrap x 150…350).
    createWrapLayer(image('logo', 100, 100), { mode: 'CUSTOM', offsetX: -100, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false }),
  ];
  const resolved = resolvePanelArtwork(configuration, 'FRONT');
  return { configuration, panelSize: getPanelSize('FRONT', configuration.dimensions), layers: resolved.layers };
}

describe('getCompositeFrame', () => {
  it('is the wall, extended down to the lowest layer area', () => {
    const { panelSize, layers } = layeredFront();
    expect(getCompositeFrame(panelSize, layers)).toEqual({ x: 0, y: -90, width: 200, height: 490 });
    expect(getCompositeFrame(panelSize, [layers[1]])).toEqual({ x: 0, y: 0, width: 200, height: 400 });
  });
});

describe('planArtworkComposite', () => {
  it('sizes the canvas to the finest layer, capped by the long-side limit', () => {
    const { panelSize, layers } = layeredFront();
    // Background: 1400 px over the 700 mm wrap = 2 px/mm. Logo: contain in 700 × 400 = 400 mm, × 0.25 = 100 mm → 1 px/mm.
    const plan = planArtworkComposite(panelSize, layers, { maxLongSidePx: 4096 });
    expect(plan.pixelsPerMm).toBeCloseTo(2);
    expect([plan.width, plan.height]).toEqual([400, 980]);
    const capped = planArtworkComposite(panelSize, layers, { maxLongSidePx: 490 });
    expect([capped.width, capped.height]).toEqual([200, 490]);
  });

  it('maps every image corner to where the shared placement transform puts it (canvas y down from the frame top)', () => {
    const { panelSize, layers } = layeredFront();
    const plan = planArtworkComposite(panelSize, layers, { maxLongSidePx: 490 }); // 1 px per mm
    const [bg, logo] = plan.layers;
    // Background FILL over the extended wrap (FRONT-local x ∈ [−150, 550], y ∈ [−90, 400]): its top-left pixel 150 mm
    // left of the frame (on LEFT), its bottom-right pixel 550 mm to the right (outside this wall) at the frame bottom.
    expect(apply(bg.matrix, 0, 0).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-150, 0]);
    expect(apply(bg.matrix, 1400, 980).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([550, 490]);
    // Logo 100 × 100 mm centred at FRONT-local (100, 200): canvas x 50…150, y (400 − 250)…(400 − 150).
    expect(apply(logo.matrix, 0, 0).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([50, 150]);
    expect(apply(logo.matrix, 100, 100).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([150, 250]);
  });

  it('clips each layer vertically to its artwork area and horizontally to the wall and its copy extent', () => {
    const { panelSize, layers } = layeredFront();
    const plan = planArtworkComposite(panelSize, layers, { maxLongSidePx: 490 });
    expect(plan.layers[0].clip).toEqual({ x: 0, y: 0, width: 200, height: 490 });
    // The logo spans FRONT x 50…150 only; without extension it never reaches below the bottom line.
    expect(plan.layers[1].clip).toEqual({ x: 50, y: 0, width: 100, height: 400 });
  });

  it('follows the rotation of a placement', () => {
    const panelSize = { width: 200, height: 400 };
    const layer: CompositeLayerInput = {
      artwork: { fileUrl: 'blob:r', width: 200, height: 100 },
      placement: containPlacement(90),
      area: { x: 0, y: 0, width: 200, height: 400 },
    };
    const plan = planArtworkComposite(panelSize, [layer, layer], { maxLongSidePx: 400 });
    // 90° CCW: the 2:1 image stands upright, 200 mm tall, 100 mm wide... contain in 200 × 400 → 200 × 400 mm box.
    const corners = [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ].map(([x, y]) => apply(plan.layers[0].matrix, x, y).map((v) => Math.round(v * 1e6) / 1e6));
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 200, 0, 400]);
    // Image top-left (0, 0) → after a CCW quarter turn it sits at the bottom-left of the box (canvas y down).
    expect(corners[0]).toEqual([0, 400]);
  });

  it('leaves out layers without a usable image or outside the frame', () => {
    const panelSize = { width: 200, height: 400 };
    const plan = planArtworkComposite(
      panelSize,
      [
        { artwork: { fileUrl: 'blob:0', width: 0, height: 0 }, placement: fillPlacement(), area: { x: 0, y: 0, width: 200, height: 400 } },
        { artwork: { fileUrl: 'blob:1', width: 10, height: 10 }, placement: fillPlacement(), area: { x: 0, y: 0, width: 200, height: 400 }, clipX: { x0: 300, x1: 500 } },
        { artwork: { fileUrl: 'blob:2', width: 10, height: 10 }, placement: fillPlacement(), area: { x: 0, y: 0, width: 200, height: 400 } },
      ],
      { maxLongSidePx: 400 },
    );
    expect(plan.layers.map((layer) => layer.artwork.fileUrl)).toEqual(['blob:2']);
    // Tiny images still give at least 1 px per mm.
    expect(plan.pixelsPerMm).toBeCloseTo(1);
  });

  it('draws a logo straddling the LEFT | FRONT corner on both walls', () => {
    const configuration = createConfiguration('BLOCK');
    configuration.artworkLayout = 'WRAP';
    configuration.wrapLayers = [
      createWrapLayer(image('bg', 1400, 800), fillPlacement()),
      // 100 mm logo centred on the LEFT | FRONT corner (wrap x 150).
      createWrapLayer(image('logo', 100, 100), { mode: 'CUSTOM', offsetX: -200, offsetY: 0, scale: 0.25, rotation: 0, extendToBottom: false }),
    ];
    const plan = (position: 'FRONT' | 'LEFT') =>
      planArtworkComposite(getPanelSize(position, configuration.dimensions), resolvePanelArtwork(configuration, position).layers, {
        maxLongSidePx: 400,
      });
    const front = plan('FRONT');
    const left = plan('LEFT');
    expect(front.layers[1].clip).toEqual({ x: 0, y: 0, width: 50, height: 400 });
    expect(left.layers[1].clip).toEqual({ x: 100, y: 0, width: 50, height: 400 });
    // FRONT: image x 50 px (its middle) at the wall's left edge; LEFT: the same image point at the wall's right edge.
    expect(apply(front.layers[1].matrix, 50, 50).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 200]);
    expect(apply(left.layers[1].matrix, 50, 50).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([150, 200]);
  });

  it('composites whole-sheet layers over the wall and its bottom allowance, clipped to the wall column', () => {
    const configuration = createConfiguration('BLOCK'); // sheet 710 × 490, FRONT column 150…350, a = 90
    configuration.artworkLayout = 'SHEET';
    configuration.sheetLayers = [
      createWrapLayer(image('sheet', 710, 490), fillPlacement(true)),
      createWrapLayer(image('logo', 100, 100), { mode: 'CUSTOM', offsetX: -105, offsetY: 45, scale: 100 / 490, rotation: 0, extendToBottom: true }),
    ];
    const layers = resolvePanelArtwork(configuration, 'FRONT').layers;
    const plan = planArtworkComposite(getPanelSize('FRONT', configuration.dimensions), layers, { maxLongSidePx: 490 });
    expect(plan.frame).toEqual({ x: 0, y: -90, width: 200, height: 490 });
    expect(plan.layers[0].clip).toEqual({ x: 0, y: 0, width: 200, height: 490 });
    // The sheet image: its pixel (150, 0) (sheet x 150, top) at the frame's top-left.
    expect(apply(plan.layers[0].matrix, 150, 0).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0]);
    // Logo centred on FRONT (sheet 250, 290): canvas centre (100, 490 − 290 − 90 + 90) = (100, 200).
    expect(apply(plan.layers[1].matrix, 50, 50).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([100, 200]);
  });
});
