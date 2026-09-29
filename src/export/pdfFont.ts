// Unicode font for jsPDF: its standard fonts only cover WinAnsi, which garbles Polish letters (ą ć ę ł ń ś ź ż).
// Bundled Noto Sans subsets (Latin, Latin-1, Latin Extended-A + typographic punctuation, a few symbols and Greek Δ…; SIL OFL,
// see fonts/OFL.txt), ~50 kB each. Fetched lazily on first PDF export — the URLs are the only thing in the bundle.

import type { jsPDF } from 'jspdf';
import boldUrl from './fonts/NotoSans-Bold.ttf?url';
import regularUrl from './fonts/NotoSans-Regular.ttf?url';

export const PDF_FONT_FAMILY = 'NotoSans';

/** Base64-encoded TTF files. */
export type PdfFontData = { regular: string; bold: string };
export type PdfFontLoader = () => Promise<PdfFontData>;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

let cached: Promise<PdfFontData> | null = null;

/** Default loader: fetches the bundled TTF files once per session. */
export const loadBundledPdfFonts: PdfFontLoader = () => {
  cached ??= Promise.all(
    [regularUrl, boldUrl].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Font ${url}: HTTP ${response.status}`);
      return arrayBufferToBase64(await response.arrayBuffer());
    }),
  )
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
};

/** Registers Noto Sans (normal + bold) in `pdf` under `PDF_FONT_FAMILY` and makes it the current font. */
export async function registerPdfFonts(pdf: jsPDF, loader: PdfFontLoader = loadBundledPdfFonts): Promise<void> {
  const { regular, bold } = await loader();
  pdf.addFileToVFS('NotoSans-Regular.ttf', regular);
  pdf.addFont('NotoSans-Regular.ttf', PDF_FONT_FAMILY, 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', bold);
  pdf.addFont('NotoSans-Bold.ttf', PDF_FONT_FAMILY, 'bold');
  pdf.setFont(PDF_FONT_FAMILY, 'normal');
}

/** Makes the dieline SVG texts use the embedded font (svg2pdf picks the first family registered in jsPDF). */
export const withEmbeddedSvgFont = (svg: string) =>
  svg.replace(/font-family="([^"]*)"/g, (_, families: string) => `font-family="${PDF_FONT_FAMILY}, ${families}"`);
