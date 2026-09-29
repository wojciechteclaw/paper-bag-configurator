// SVG export of the dieline: 1:1 in millimetres, one Inkscape layer per content type
// (artwork, cut, crease, annotations). Images must be embedded (data URLs) — see `embedImages`.

import { DIELINE_STYLE, matrixAttr, type DielineScene } from './scene';

export type DielineSvgOptions = {
  /** Replaces image hrefs (e.g. blob: → data: URLs). Missing entries keep the original href. */
  hrefs?: Record<string, string>;
  includeArtwork?: boolean;
  title?: string;
};

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const layer = (id: string, label: string, body: string[]) =>
  `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${esc(label)}">\n${body.map((l) => `    ${l}`).join('\n')}\n  </g>`;

const line = (l: { x1: number; y1: number; x2: number; y2: number }, attrs: string, id?: string) =>
  `<line${id ? ` id="${esc(id)}"` : ''} x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" ${attrs}/>`;

const text = (t: { x: number; y: number; text: string; size: number; rotate?: number }) =>
  `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" fill="${DIELINE_STYLE.text}"${
    t.rotate ? ` transform="rotate(${t.rotate} ${t.x} ${t.y})"` : ''
  }>${esc(t.text)}</text>`;

/** Builds the export SVG document (string). Pure; safe to call in tests. */
export function buildDielineSvg(scene: DielineScene, options: DielineSvgOptions = {}): string {
  const { hrefs = {}, includeArtwork = true, title = 'Dieline' } = options;
  const [vx, vy, vw, vh] = scene.viewBox;
  const s = DIELINE_STYLE;

  const defs = scene.images.map(
    (image) =>
      `<clipPath id="${image.clip.id}"><rect x="${image.clip.x}" y="${image.clip.y}" width="${image.clip.width}" height="${image.clip.height}"/></clipPath>`,
  );

  const artwork = includeArtwork
    ? scene.images.map(
        (image) =>
          `<g clip-path="url(#${image.clip.id})"><image id="${image.id}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="${matrixAttr(
            image.matrix,
          )}" href="${esc(hrefs[image.href] ?? image.href)}" xlink:href="${esc(hrefs[image.href] ?? image.href)}"/></g>`,
      )
    : [];

  const cut = scene.cuts.map(
    (d, i) => `<path id="cut-${i + 1}" d="${d}" fill="none" stroke="${s.cut.stroke}" stroke-width="${s.cut.width}"/>`,
  );
  const crease = scene.creases.map((l) =>
    line(l, `fill="none" stroke="${s.crease.stroke}" stroke-width="${s.crease.width}" stroke-dasharray="${s.crease.dash}" data-code="${l.code}"`, l.id),
  );

  const zoneRect = (z: { x: number; y: number; width: number; height: number }, attrs: string, id: string) =>
    `<rect id="${esc(id)}" x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" ${attrs}/>`;
  const annotations = [
    ...scene.zones.map((z) => {
      switch (z.kind) {
        case 'BLEED':
          return zoneRect(z, `fill="none" stroke="${s.bleed.stroke}" stroke-width="${s.bleed.width}"`, z.id);
        case 'SAFETY':
          return zoneRect(z, `fill="none" stroke="${s.safety.stroke}" stroke-width="${s.safety.width}" stroke-dasharray="${s.safety.dash}"`, z.id);
        case 'BOTTOM_ALLOWANCE':
          return zoneRect(z, `fill="${s.allowanceFill}" stroke="none"`, z.id);
        case 'BOTTOM_FLAP_GLUE':
          return zoneRect(z, `fill="${s.bottomGlueFill}" stroke="none"`, z.id);
        case 'GLUE_FLAP':
          return zoneRect(z, `fill="${s.glueFlapFill}" stroke="none"`, z.id);
      }
    }),
    ...scene.patches.map((p) =>
      zoneRect(p, `fill="none" stroke="${s.patch.stroke}" stroke-width="${s.patch.width}" stroke-dasharray="${s.patch.dash}"`, p.id),
    ),
    ...scene.dimensions.flatMap((d) => [
      line(d.line, `stroke="${s.dimension.stroke}" stroke-width="${s.dimension.width}"`),
      ...d.extensions.map((e) => line(e, `stroke="${s.dimension.stroke}" stroke-width="${s.dimension.width}"`)),
      text(d.text),
    ]),
    ...scene.labels.map(text),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" width="${vw}mm" height="${vh}mm" viewBox="${vx} ${vy} ${vw} ${vh}">`,
    `  <title>${esc(title)}</title>`,
    `  <defs>${defs.join('')}</defs>`,
    layer('artwork', 'Artwork', artwork),
    layer('annotations', 'Annotations', annotations),
    layer('crease', 'Crease', crease),
    layer('cut', 'Cut', cut),
    '</svg>',
    '',
  ].join('\n');
}

/** Reads every image href (blob:/http) into a data URL so the exported file is self-contained. */
export async function embedImages(scene: DielineScene): Promise<Record<string, string>> {
  const unique = [...new Set(scene.images.map((image) => image.href))].filter((href) => !href.startsWith('data:'));
  const entries = await Promise.all(
    unique.map(async (href) => {
      try {
        const blob = await (await fetch(href)).blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return [href, dataUrl] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportDielineSvgFile(scene: DielineScene, fileName: string, title?: string) {
  const hrefs = await embedImages(scene);
  const svg = buildDielineSvg(scene, { hrefs, title });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName);
}
