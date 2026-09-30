// PDF export of the dieline, 1:1 in millimetres. jsPDF + svg2pdf.js are loaded lazily (dynamic import) so they
// stay out of the main bundle.

import type { PaperColor } from '../domain/types';
import { embedSceneImagesForPdf } from '../export/flattenArtwork';
import { registerPdfFonts, withEmbeddedSvgFont } from '../export/pdfFont';
import { buildDielineSvg, downloadBlob } from './exportSvg';
import { withPdfLayout, type DielinePdfTexts } from './pdfLayout';
import type { DielineScene } from './scene';

// jsPDF's standard fonts only cover WinAnsi (Latin-1-ish): Polish letters outside it (ą ć ę ł ń ś ź ż …) would be
// garbled. The export embeds a Unicode font (Noto Sans, src/export/pdfFont.ts); only if that font cannot be loaded
// are PDF texts transliterated as a fallback. The SVG export always keeps the original text.
const NON_WIN_ANSI: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ś: 'S', Ź: 'Z', Ż: 'Z',
  '…': '...', '—': '-', '–': '-',
};
export const toWinAnsi = (text: string) => text.replace(/[ąćęłńśźżĄĆĘŁŃŚŹŻ…—–]/g, (c) => NON_WIN_ANSI[c] ?? c);

function withPdfSafeTexts(scene: DielineScene): DielineScene {
  return {
    ...scene,
    labels: scene.labels.map((label) => ({ ...label, text: toWinAnsi(label.text) })),
    dimensions: scene.dimensions.map((d) => ({ ...d, text: { ...d.text, text: toWinAnsi(d.text.text) } })),
  };
}

/**
 * `pdfTexts` (client, 30.09.2026): the PDF drawing carries no dimension lines — the parameters are written above the
 * sheet and the wall names below it (`withPdfLayout`). Without it the scene is exported as drawn.
 */
export async function exportDielinePdfFile(
  drawnScene: DielineScene,
  fileName: string,
  title?: string,
  paperColor: PaperColor = 'WHITE',
  pdfTexts?: DielinePdfTexts,
) {
  const scene = pdfTexts ? withPdfLayout(drawnScene, pdfTexts) : drawnScene;
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const hrefs = await embedSceneImagesForPdf(scene, paperColor);
  const [, , width, height] = scene.viewBox;
  const pdf = new jsPDF({
    unit: 'mm',
    format: [width, height],
    orientation: width >= height ? 'landscape' : 'portrait',
    compress: true,
  });
  let unicode = true;
  try {
    await registerPdfFonts(pdf);
  } catch (error) {
    console.warn('PDF font could not be loaded, transliterating Polish letters', error);
    unicode = false;
  }
  const svgText = unicode
    ? withEmbeddedSvgFont(buildDielineSvg(scene, { hrefs, title }))
    : buildDielineSvg(withPdfSafeTexts(scene), { hrefs, title: title && toWinAnsi(title) });

  const element = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  // svg2pdf reads computed styles, so the element has to be in the document while it renders.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden';
  host.appendChild(document.importNode(element, true));
  document.body.appendChild(host);
  try {
    if (title) pdf.setProperties({ title: unicode ? title : toWinAnsi(title) });
    await svg2pdf(host.firstElementChild as Element, pdf, { x: 0, y: 0, width, height });
    downloadBlob(pdf.output('blob'), fileName);
  } finally {
    host.remove();
  }
}
