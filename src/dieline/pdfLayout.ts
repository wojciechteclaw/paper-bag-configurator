// Page layout of the dieline PDF (client, 30.09.2026): no dimension lines on the drawing; the parameters are written
// above the sheet and the wall names below it, one under each column. Pure; the SVG export keeps its dimensions.

import type { PanelPosition } from '../domain/types';
import type { DielineScene, SceneText } from './scene';

export type DielinePdfTexts = {
  /** Lines written above the sheet (title, parameters), top → bottom. */
  header: string[];
  /** Name of each wall, written under its column. */
  wallName: (panel: PanelPosition) => string;
  /** Name of the glue flap column (after the last wall), or null to leave it unnamed. */
  glueFlapName: string | null;
};

/** Text height of the header lines and the wall names, mm, relative to the sheet width (readable on large sheets). */
const textSize = (sheetWidth: number) => Math.max(6, Math.min(14, sheetWidth / 45));
const LINE_GAP = 1.5;
const MARGIN = 6;

/** The scene without dimensions and panel labels, with the header above and the wall names below the sheet. */
export function withPdfLayout(scene: DielineScene, texts: DielinePdfTexts): DielineScene {
  const { width, height } = scene.sheet;
  const size = textSize(width);
  const lineHeight = size * LINE_GAP;
  const top = MARGIN + texts.header.length * lineHeight;
  const bottom = MARGIN + lineHeight;

  const header: SceneText[] = texts.header.map((text, i) => ({
    id: `pdf-header-${i}`,
    x: width / 2,
    y: -top + MARGIN / 2 + size + i * lineHeight,
    text,
    size,
  }));
  const walls: SceneText[] = scene.segments
    .filter((segment) => segment.x1 - segment.x0 > 0)
    .map((segment) => ({
      id: `pdf-wall-${segment.id}`,
      x: (segment.x0 + segment.x1) / 2,
      y: height + MARGIN / 2 + size,
      text: texts.wallName(segment.panel),
      size,
    }));
  const lastWallEnd = Math.max(0, ...scene.segments.map((segment) => segment.x1));
  const glue: SceneText[] =
    texts.glueFlapName && width - lastWallEnd > 0
      ? [{ id: 'pdf-wall-glue', x: (lastWallEnd + width) / 2, y: height + MARGIN / 2 + size, text: texts.glueFlapName, size: size * 0.6 }]
      : [];

  return {
    ...scene,
    dimensions: [],
    labels: [...header, ...walls, ...glue],
    viewBox: [-MARGIN, -top, width + 2 * MARGIN, height + top + bottom],
  };
}
