// Thin jsPDF adapter: lays out `ProductSheetData` + the dieline scene + 3D snapshots as an A4 product sheet.
// Loaded lazily together with jsPDF / svg2pdf.js. Needs a DOM (svg2pdf renders a live SVG element).
//
// Pages: 1 parameters + Pantone / ink coverage (portrait), 2 dieline fitted to the page with its scale (landscape),
// 3 3D views, 4 folded-bag options (portrait).

import type { jsPDF as JsPdf } from 'jspdf';
import { buildDielineSvg, embedImages } from '../dieline/exportSvg';
import { DIELINE_STYLE, type DielineScene } from '../dieline/scene';
import type { ExportContext } from './format';
import { PDF_FONT_FAMILY, registerPdfFonts, withEmbeddedSvgFont, type PdfFontLoader } from './pdfFont';
import { fitToBox, formatScaleNote, type ProductSheetData, type ProductSheetViewPage } from './productSheetData';

export type ProductSheetPdfInput = {
  data: ProductSheetData;
  /** Dieline scene with localized labels (same one the 2D view draws). */
  scene: DielineScene;
  /** View id → image data URL (PNG / JPEG). Missing views get a placeholder frame. */
  snapshots: Record<string, string>;
  context: ExportContext;
  fonts?: PdfFontLoader;
  /** Pre-embedded image hrefs of the scene (blob: → data:); embedded here when omitted. */
  imageHrefs?: Record<string, string>;
};

const MARGIN = 15;
const TEXT = '#1f2328';
const MUTED = '#5b6470';
const RULE = '#c9ced6';

type Pdf = JsPdf;

function setText(pdf: Pdf, size: number, style: 'normal' | 'bold' = 'normal', color = TEXT) {
  pdf.setFont(PDF_FONT_FAMILY, style);
  pdf.setFontSize(size);
  pdf.setTextColor(color);
}

function pageSize(pdf: Pdf) {
  return { width: pdf.internal.pageSize.getWidth(), height: pdf.internal.pageSize.getHeight() };
}

function pageHeader(pdf: Pdf, title: string, subtitle?: string): number {
  setText(pdf, 16, 'bold');
  pdf.text(title, MARGIN, MARGIN + 5);
  let y = MARGIN + 5;
  if (subtitle) {
    setText(pdf, 10, 'normal', MUTED);
    pdf.text(subtitle, MARGIN, y + 6);
    y += 6;
  }
  pdf.setDrawColor(RULE);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y + 3, pageSize(pdf).width - MARGIN, y + 3);
  return y + 9;
}

/** Page 1: parameter sections in two columns, then the Pantone / ink coverage table. */
function drawParametersPage(pdf: Pdf, data: ProductSheetData, context: ExportContext) {
  const { width, height } = pageSize(pdf);
  let top = pageHeader(pdf, `${data.title} — ${data.subtitle}`, new Date().toLocaleDateString(context.language));

  const gap = 8;
  const colWidth = (width - 2 * MARGIN - gap) / 2;
  const labelWidth = colWidth * 0.46;
  const valueWidth = colWidth - labelWidth - 2;
  const half = Math.ceil(data.parameters.sections.length / 2);
  const columns = [data.parameters.sections.slice(0, half), data.parameters.sections.slice(half)];
  const bottoms = columns.map((sections, c) => {
    const x = MARGIN + c * (colWidth + gap);
    let y = top;
    for (const section of sections) {
      setText(pdf, 10.5, 'bold');
      pdf.text(section.title, x, y);
      pdf.setDrawColor(RULE);
      pdf.line(x, y + 1.5, x + colWidth, y + 1.5);
      y += 6;
      for (const row of section.rows) {
        const value = `${typeof row.value === 'number' ? formatValue(row.value, context) : row.value}${row.unit ? ` ${row.unit}` : ''}`;
        setText(pdf, 8.5, 'normal', MUTED);
        const label = pdf.splitTextToSize(row.label, labelWidth) as string[];
        setText(pdf, 8.5, 'normal');
        const lines = pdf.splitTextToSize(value, valueWidth) as string[];
        setText(pdf, 8.5, 'normal', MUTED);
        pdf.text(label, x, y);
        setText(pdf, 8.5, 'normal');
        pdf.text(lines, x + labelWidth + 2, y);
        y += 4.3 * Math.max(label.length, lines.length);
      }
      y += 3;
    }
    return y;
  });
  top = Math.max(...bottoms) + 2;

  // ——— Pantone table ———
  const table = data.pantone;
  const rowH = 6.5;
  const needed = 12 + rowH * (table.rows.length + 3) + 14;
  if (top + needed > height - 20) {
    pdf.addPage('a4', 'portrait');
    top = pageHeader(pdf, table.title);
  } else {
    setText(pdf, 10.5, 'bold');
    pdf.text(table.title, MARGIN, top);
    pdf.setDrawColor(RULE);
    pdf.line(MARGIN, top + 1.5, width - MARGIN, top + 1.5);
    top += 7;
  }
  const cols = [MARGIN, MARGIN + 18, MARGIN + 95, MARGIN + 140];
  const right = width - MARGIN;
  setText(pdf, 8.5, 'bold', MUTED);
  pdf.text(table.headers.color, cols[0], top);
  pdf.text(table.headers.code, cols[1], top);
  pdf.text(table.headers.percent, cols[3] - 4, top, { align: 'right' });
  pdf.text(table.headers.area, right, top, { align: 'right' });
  top += 2;
  pdf.line(MARGIN, top, right, top);
  top += rowH - 1.5;

  for (const row of table.rows) {
    pdf.setFillColor(row.hex);
    pdf.setDrawColor('#888888');
    pdf.rect(cols[0], top - 4, 12, 5, 'FD');
    setText(pdf, 9, 'normal');
    pdf.text(row.code, cols[1], top);
    setText(pdf, 8, 'normal', MUTED);
    pdf.text(row.hex, cols[1] + 50, top);
    setText(pdf, 9, 'normal');
    pdf.text(row.percent, cols[3] - 4, top, { align: 'right' });
    pdf.text(row.area, right, top, { align: 'right' });
    top += rowH;
  }
  pdf.setDrawColor(RULE);
  pdf.line(MARGIN, top - rowH + 2, right, top - rowH + 2);
  const summaryRows = [table.total, ...(table.unassigned ? [table.unassigned] : [])];
  summaryRows.forEach((row, i) => {
    setText(pdf, 9, i === 0 ? 'bold' : 'normal');
    pdf.text(row.label, cols[1], top);
    pdf.text(row.percent, cols[3] - 4, top, { align: 'right' });
    pdf.text(row.area, right, top, { align: 'right' });
    top += rowH;
  });
  setText(pdf, 7.5, 'normal', MUTED);
  for (const note of table.notes) {
    const lines = pdf.splitTextToSize(note, width - 2 * MARGIN) as string[];
    pdf.text(lines, MARGIN, top);
    top += 3.4 * lines.length + 1;
  }
}

const formatValue = (value: number, { language }: ExportContext) =>
  new Intl.NumberFormat(language.startsWith('pl') ? 'pl-PL' : 'en-GB', { maximumFractionDigits: 1 }).format(value);

/** Page 2 (landscape): the dieline SVG fitted to the page, scale note and line legend. */
async function drawDielinePage(pdf: Pdf, input: ProductSheetPdfInput, svg2pdf: typeof import('svg2pdf.js').svg2pdf) {
  const { data, scene, context } = input;
  pdf.addPage('a4', 'landscape');
  const { width, height } = pageSize(pdf);
  const [, , vw, vh] = scene.viewBox;
  const top = MARGIN + 13;
  const legendH = 10;
  const fit = fitToBox(vw, vh, width - 2 * MARGIN, height - top - MARGIN - legendH);
  pageHeader(pdf, data.dieline.title, `${data.subtitle} · ${formatScaleNote(fit.scale, context)}`);

  const hrefs = input.imageHrefs ?? (await embedImages(scene));
  const svgText = withEmbeddedSvgFont(buildDielineSvg(scene, { hrefs, title: data.dieline.svgTitle }));
  const element = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  // svg2pdf reads computed styles, so the element has to be in the document while it renders.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden';
  host.appendChild(document.importNode(element, true));
  document.body.appendChild(host);
  try {
    const x = (width - fit.width) / 2;
    await svg2pdf(host.firstElementChild as Element, pdf, { x, y: top, width: fit.width, height: fit.height });
  } finally {
    host.remove();
  }

  // Legend
  const y = height - MARGIN - 2;
  let x = MARGIN;
  const sample = (stroke: string, lineWidth: number, dash: number[] | null, label: string) => {
    pdf.setDrawColor(stroke);
    pdf.setLineWidth(lineWidth);
    pdf.setLineDashPattern(dash ?? [], 0);
    pdf.line(x, y - 1.2, x + 10, y - 1.2);
    pdf.setLineDashPattern([], 0);
    setText(pdf, 8, 'normal', MUTED);
    pdf.text(label, x + 12, y);
    x += 16 + pdf.getTextWidth(label);
  };
  const s = DIELINE_STYLE;
  const dash = (value: string) => value.split(/\s+/).map(Number);
  sample(s.cut.stroke, s.cut.width, null, data.dieline.legend.cut);
  sample(s.crease.stroke, s.crease.width, dash(s.crease.dash), data.dieline.legend.crease);
  if (scene.patches.length > 0) sample(s.patch.stroke, s.patch.width, dash(s.patch.dash), data.dieline.legend.patch);
}

/** Pages 3–4: a 2 × 2 grid of 4:3 snapshots with captions. */
function drawViewPage(pdf: Pdf, page: ProductSheetViewPage, input: ProductSheetPdfInput) {
  pdf.addPage('a4', 'portrait');
  const { width } = pageSize(pdf);
  let top = pageHeader(pdf, page.title, input.data.subtitle);
  if (page.note) {
    setText(pdf, 8.5, 'normal', MUTED);
    const lines = pdf.splitTextToSize(page.note, width - 2 * MARGIN) as string[];
    pdf.text(lines, MARGIN, top);
    top += 4 * lines.length + 3;
  }
  const gap = 6;
  const cellW = (width - 2 * MARGIN - gap) / 2;
  const cellH = cellW * 0.75;
  page.views.forEach((view, i) => {
    const x = MARGIN + (i % 2) * (cellW + gap);
    const y = top + Math.floor(i / 2) * (cellH + 14);
    const image = input.snapshots[view.id];
    pdf.setDrawColor(RULE);
    pdf.setLineWidth(0.2);
    if (image) {
      pdf.addImage(image, image.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, cellW, cellH, view.id, 'FAST');
      pdf.rect(x, y, cellW, cellH);
    } else {
      pdf.setFillColor('#f1f2f4');
      pdf.rect(x, y, cellW, cellH, 'FD');
      setText(pdf, 9, 'normal', MUTED);
      pdf.text(input.context.t('export.views.unavailable'), x + cellW / 2, y + cellH / 2, { align: 'center' });
    }
    setText(pdf, 9, 'normal');
    pdf.text(pdf.splitTextToSize(view.caption, cellW) as string[], x, y + cellH + 5);
  });
}

function drawFooters(pdf: Pdf, data: ProductSheetData, context: ExportContext) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    const { width, height } = pageSize(pdf);
    setText(pdf, 7.5, 'normal', MUTED);
    pdf.text(data.footer, MARGIN, height - 7);
    pdf.text(context.t('export.pdf.page', { page: i, total }), width - MARGIN, height - 7, { align: 'right' });
  }
}

/** Builds the product sheet PDF and returns it as a Blob. */
export async function buildProductSheetPdf(input: ProductSheetPdfInput): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { data, context } = input;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  await registerPdfFonts(pdf, input.fonts);
  pdf.setProperties({ title: `${data.title} — ${data.subtitle}`, subject: data.subtitle, creator: 'Paper bag configurator' });
  pdf.setLanguage(context.language.startsWith('pl') ? 'pl' : 'en-GB');

  drawParametersPage(pdf, data, context);
  await drawDielinePage(pdf, input, svg2pdf);
  for (const page of data.viewPages) drawViewPage(pdf, page, input);
  drawFooters(pdf, data, context);
  return pdf.output('blob');
}
