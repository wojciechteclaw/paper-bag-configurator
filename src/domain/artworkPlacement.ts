// Artwork positioning module (docs/SPEC.md §3, §4b, §4f). Pure TS: no React, no Three.js.
//
// One definition of "where is the image on the wall" shared by the 3D renderer (texture UV transform), the 2D
// dieline (SVG image matrix, derived from `computePanelUvTransform`) and the ink coverage estimate, so all of them
// always show / count the same result.
//
// Coordinates:
// - panel-local mm, seen from outside, origin bottom-left of the VISIBLE wall (bottom line y = 0), y up;
// - the ARTWORK AREA is the rectangle the placement refers to: the visible wall [0, Pw] × [0, H], or — with
//   `extendToBottom` — the wall plus the bottom allowance [0, Pw] × [−a, H], a = (D + 30) / 2 (`getPanelArtworkArea`);
// - panel UV = (x / panelWidth, y / panelHeight) of the VISIBLE wall, whatever the area — what the renderer's
//   geometry uses. The bottom allowance continues the same UV space below v = 0 (v = y / H < 0);
// - texture coordinates t ∈ [0,1]², t = (0,0) at the image's bottom-left (three.js `flipY = true` convention).

import { ARTWORK_EXTEND_TO_BOTTOM_DEFAULT, ARTWORK_PLACEMENT_RULES } from './config/productionRules';
import { getBottomAllowance } from './geometry/tube';
import { getPanelSize } from './panels';
import type { ArtworkPlacement, ArtworkRotation, Dimensions, PanelPosition } from './types';

export type Size2 = { width: number; height: number };

/** Axis-aligned rectangle in panel-local mm (x, y = bottom-left corner). */
export type PanelArtworkArea = { x: number; y: number; width: number; height: number };

/**
 * Texture transform in the three.js convention (`texture.repeat`, `texture.offset`, `texture.rotation` in radians,
 * `texture.center` left at its default (0, 0)): t = diag(repeat) · R(−rotation) · uv + offset.
 * Texture coordinates outside [0,1]² lie outside the image and must show bare paper (not clamped edge pixels).
 */
export type PanelUvTransform = {
  repeat: [number, number];
  offset: [number, number];
  rotation: number;
};

/** 2D affine map (SVG `matrix(a b c d e f)` order): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine2 = { a: number; b: number; c: number; d: number; e: number; f: number };

/** The image rectangle on the wall in panel-local mm (before rotation: `width` × `height` around `center`). */
export type ArtworkRect = {
  center: { x: number; y: number };
  width: number;
  height: number;
  rotation: ArtworkRotation;
};

export type HorizontalAlignment = 'LEFT' | 'CENTER' | 'RIGHT';
export type VerticalAlignment = 'TOP' | 'MIDDLE' | 'BOTTOM';
/** One or both axes; an omitted axis keeps its current offset. */
export type ArtworkAlignment = { horizontal?: HorizontalAlignment; vertical?: VerticalAlignment };

export const FILL_PLACEMENT: ArtworkPlacement = { mode: 'FILL', extendToBottom: false };

/** Placement of new artwork / new panels / "Reset": FILL, extension per `ARTWORK_EXTEND_TO_BOTTOM_DEFAULT`. */
export const DEFAULT_PLACEMENT: ArtworkPlacement = { mode: 'FILL', extendToBottom: ARTWORK_EXTEND_TO_BOTTOM_DEFAULT };

const ROTATIONS: readonly ArtworkRotation[] = [0, 90, 180, 270];
// Exact cos/sin for the 90° steps (avoids 6e-17 noise in transforms).
const COS: Record<ArtworkRotation, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<ArtworkRotation, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

const isPositiveSize = (size: Size2) =>
  Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isQuarter = (rotation: ArtworkRotation) => rotation === 90 || rotation === 270;

/** The visible wall as an artwork area (the default when no area is given). */
export function wallArtworkArea(panelSize: Size2): PanelArtworkArea {
  return { x: 0, y: 0, width: panelSize.width, height: panelSize.height };
}

/**
 * Artwork area of a panel in panel-local mm: the visible wall (y ∈ [0, H]) or, with `extendToBottom`, the wall plus
 * the bottom allowance (y ∈ [−a, H], a = (D + 30) / 2) — W × (H + a) on FRONT/BACK, D × (H + a) on LEFT/RIGHT.
 */
export function getPanelArtworkArea(
  position: PanelPosition,
  dimensions: Dimensions,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  const size = getPanelSize(position, dimensions);
  if (!placement.extendToBottom) return wallArtworkArea(size);
  const a = getBottomAllowance(dimensions);
  return { x: 0, y: -a, width: size.width, height: size.height + a };
}

/** mm per image pixel so the whole image fits the area (touching two edges). Rotation-aware (90°/270° swap). */
function containMmPerPixel(area: Size2, image: Size2, rotation: ArtworkRotation): number {
  const iw = isQuarter(rotation) ? image.height : image.width;
  const ih = isQuarter(rotation) ? image.width : image.height;
  return Math.min(area.width / iw, area.height / ih);
}

/** Scale (relative to contain) at which the image covers the whole area. ≥ 1. */
export function getCoverScale(area: Size2, image: Size2, rotation: ArtworkRotation = 0): number {
  if (!isPositiveSize(area) || !isPositiveSize(image)) return 1;
  const iw = isQuarter(rotation) ? image.height : image.width;
  const ih = isQuarter(rotation) ? image.width : image.height;
  const contain = Math.min(area.width / iw, area.height / ih);
  const cover = Math.max(area.width / iw, area.height / ih);
  return cover / contain;
}

/**
 * Image rectangle in panel-local mm. FILL = the whole area. `area` defaults to the visible wall of `panel`
 * (pass `getPanelArtworkArea(...)` to honour `extendToBottom`).
 */
export function getArtworkRect(
  panel: Size2,
  image: Size2,
  placement: ArtworkPlacement,
  area: PanelArtworkArea = wallArtworkArea(panel),
): ArtworkRect {
  const areaCentre = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  if (placement.mode === 'FILL' || !isPositiveSize(area) || !isPositiveSize(image)) {
    return { center: areaCentre, width: area.width, height: area.height, rotation: 0 };
  }
  const k = containMmPerPixel(area, image, placement.rotation) * placement.scale;
  return {
    center: { x: areaCentre.x + placement.offsetX, y: areaCentre.y + placement.offsetY },
    width: image.width * k,
    height: image.height * k,
    rotation: placement.rotation,
  };
}

/**
 * Texture transform for `placement` of an image of `imageSize` px on a wall of `panelSize` mm (the UV basis of the
 * geometry: uv = (x / Pw, y / H) of the visible wall). `area` is the artwork area the placement refers to (default:
 * the visible wall; pass `getPanelArtworkArea(...)` so `extendToBottom` takes effect). With the default area, FILL
 * is the identity (repeat [1,1], offset [0,0], rotation 0). Shared by the renderer, the dieline and ink coverage.
 */
export function computePanelUvTransform(
  panelSize: Size2,
  imageSize: Size2,
  placement: ArtworkPlacement,
  area: PanelArtworkArea = wallArtworkArea(panelSize),
): PanelUvTransform {
  if (!isPositiveSize(panelSize) || !isPositiveSize(area)) return { repeat: [1, 1], offset: [0, 0], rotation: 0 };
  if (placement.mode === 'FILL' || !isPositiveSize(imageSize)) {
    // t = ((x − ax) / aw, (y − ay) / ah) with x = u·Pw, y = v·Ph.
    return {
      repeat: [panelSize.width / area.width, panelSize.height / area.height],
      offset: [-area.x / area.width + 0, -area.y / area.height + 0],
      rotation: 0,
    };
  }
  const { center, width: w, height: h, rotation } = getArtworkRect(panelSize, imageSize, placement, area);
  const c = COS[rotation];
  const s = SIN[rotation];
  // diag(repeat)·R(−θ) must equal diag(1/w, 1/h)·R(−θ)·diag(Pw, Ph); for 90° steps R swaps the axes.
  const repeat: [number, number] = isQuarter(rotation)
    ? [panelSize.height / w, panelSize.width / h]
    : [panelSize.width / w, panelSize.height / h];
  // t = diag(1/w, 1/h)·R(−θ)·(p − centre) + 0.5, with R(−θ) = [[c, s], [−s, c]].
  const offset: [number, number] = [
    -(c * center.x + s * center.y) / w + 0.5,
    -(-s * center.x + c * center.y) / h + 0.5,
  ];
  return { repeat, offset, rotation: (rotation * Math.PI) / 180 };
}

/**
 * Inverse of a UV transform as an affine map from texture coordinates t (0..1, y up) to panel-local mm.
 * The dieline uses it to place the image, so 2D and 3D share `computePanelUvTransform`.
 */
export function uvTransformToPanelMatrix(panelSize: Size2, uv: PanelUvTransform): Affine2 {
  const c = Math.round(Math.cos(uv.rotation) * 1e12) / 1e12;
  const s = Math.round(Math.sin(uv.rotation) * 1e12) / 1e12;
  const [sx, sy] = uv.repeat;
  const [ox, oy] = uv.offset;
  // M⁻¹ = R(θ)·diag(1/sx, 1/sy) = [[c/sx, −s/sy], [s/sx, c/sy]]; panel = diag(Pw, Ph)·M⁻¹·(t − offset).
  const a = (panelSize.width * c) / sx;
  const cc = (panelSize.width * -s) / sy;
  const b = (panelSize.height * s) / sx;
  const d = (panelSize.height * c) / sy;
  return { a, b, c: cc, d, e: -(a * ox + cc * oy), f: -(b * ox + d * oy) };
}

export function applyAffine(m: Affine2, p: { x: number; y: number }): { x: number; y: number } {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

// ——— Editing helpers (pure; the store applies them). `area` = the artwork area size (only width/height matter:
// offsets are relative to its centre). ———

/** FILL over the artwork area (keeps the given extension flag). */
export function fillPlacement(extendToBottom = false): ArtworkPlacement {
  return { mode: 'FILL', extendToBottom };
}

/** Image fitted inside the area, centred, aspect ratio kept. */
export function containPlacement(rotation: ArtworkRotation = 0, extendToBottom = false): ArtworkPlacement {
  return { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation, extendToBottom };
}

/** Image covering the whole area, centred, aspect ratio kept (overflow is cropped). */
export function coverPlacement(
  area: Size2,
  image: Size2,
  rotation: ArtworkRotation = 0,
  extendToBottom = false,
): ArtworkPlacement {
  return { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: getCoverScale(area, image, rotation), rotation, extendToBottom };
}

/** FILL becomes a centred contain placement (the starting point of any manual edit); the extension flag is kept. */
export function toCustomPlacement(placement: ArtworkPlacement): Extract<ArtworkPlacement, { mode: 'CUSTOM' }> {
  return placement.mode === 'CUSTOM'
    ? placement
    : { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 0, extendToBottom: placement.extendToBottom === true };
}

/**
 * Brings a placement into the allowed set: scale clamped to the rules, the image centre kept inside the area (so the
 * image never disappears entirely), rotation snapped to 90° steps, non-finite numbers reset, a missing
 * `extendToBottom` (older data) read as false.
 */
export function normalizePlacement(placement: ArtworkPlacement, area: Size2): ArtworkPlacement {
  const extendToBottom = placement.extendToBottom === true;
  if (placement.mode === 'FILL') return { mode: 'FILL', extendToBottom };
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  const halfW = Math.max(0, area.width / 2);
  const halfH = Math.max(0, area.height / 2);
  const rotation = ROTATIONS.includes(placement.rotation)
    ? placement.rotation
    : ROTATIONS[((Math.round(finite(placement.rotation, 0) / 90) % 4) + 4) % 4];
  return {
    mode: 'CUSTOM',
    offsetX: clamp(finite(placement.offsetX, 0), -halfW, halfW),
    offsetY: clamp(finite(placement.offsetY, 0), -halfH, halfH),
    scale: clamp(finite(placement.scale, 1), ARTWORK_PLACEMENT_RULES.minScale, ARTWORK_PLACEMENT_RULES.maxScale),
    rotation,
    extendToBottom,
  };
}

export function movePlacement(placement: ArtworkPlacement, dx: number, dy: number, area: Size2): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  return normalizePlacement({ ...custom, offsetX: custom.offsetX + dx, offsetY: custom.offsetY + dy }, area);
}

export function scalePlacement(placement: ArtworkPlacement, factor: number, area: Size2): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  return normalizePlacement({ ...custom, scale: custom.scale * factor }, area);
}

/** Rotates by 90° counter-clockwise (or clockwise with `direction = -1`), keeping the centre. */
export function rotatePlacement(placement: ArtworkPlacement, area: Size2, direction: 1 | -1 = 1): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  const index = ROTATIONS.indexOf(custom.rotation);
  return normalizePlacement({ ...custom, rotation: ROTATIONS[(index + direction + 4) % 4] }, area);
}

/**
 * Aligns the image to an edge / the centre of the artwork area (3 × 3: LEFT/CENTER/RIGHT × TOP/MIDDLE/BOTTOM; an
 * omitted axis keeps its offset). The image's (rotation-aware) bounding box touches the chosen edge. FILL first
 * becomes a centred contain placement (a stretched image has nothing to align). With `extendToBottom`, BOTTOM is the
 * lower edge of the bottom allowance. The result is normalised (the centre stays inside the area).
 */
export function alignPlacement(
  placement: ArtworkPlacement,
  alignment: ArtworkAlignment,
  area: Size2,
  image: Size2,
): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  if (!isPositiveSize(area) || !isPositiveSize(image)) return normalizePlacement(custom, area);
  const rect = getArtworkRect(area, image, custom, wallArtworkArea(area));
  const boxW = isQuarter(custom.rotation) ? rect.height : rect.width;
  const boxH = isQuarter(custom.rotation) ? rect.width : rect.height;
  const dx = (area.width - boxW) / 2;
  const dy = (area.height - boxH) / 2;
  const offsetX =
    alignment.horizontal === 'LEFT' ? -dx : alignment.horizontal === 'RIGHT' ? dx : alignment.horizontal === 'CENTER' ? 0 : custom.offsetX;
  const offsetY =
    alignment.vertical === 'BOTTOM' ? -dy : alignment.vertical === 'TOP' ? dy : alignment.vertical === 'MIDDLE' ? 0 : custom.offsetY;
  // + 0 turns −0 into 0 (a zero slack on LEFT/BOTTOM).
  return normalizePlacement({ ...custom, offsetX: offsetX + 0, offsetY: offsetY + 0 }, area);
}

/**
 * Switches `extendToBottom`. FILL simply re-stretches over the new area. CUSTOM keeps the image exactly where it is
 * on the panel (same centre and size in mm): offsets and scale are re-expressed against the new area (`from` → `to`,
 * from `getPanelArtworkArea` before / after), then normalised against it. Without a usable image size only the flag
 * changes.
 */
export function setPlacementExtendToBottom(
  placement: ArtworkPlacement,
  extendToBottom: boolean,
  from: PanelArtworkArea,
  to: PanelArtworkArea,
  image: Size2 | null,
): ArtworkPlacement {
  if (placement.mode === 'FILL') return { mode: 'FILL', extendToBottom };
  if (!image || !isPositiveSize(image) || !isPositiveSize(from) || !isPositiveSize(to)) {
    return normalizePlacement({ ...placement, extendToBottom }, to);
  }
  const rect = getArtworkRect(from, image, placement, from);
  const scale = (placement.scale * containMmPerPixel(from, image, placement.rotation)) / containMmPerPixel(to, image, placement.rotation);
  return normalizePlacement(
    {
      ...placement,
      extendToBottom,
      scale,
      offsetX: rect.center.x - (to.x + to.width / 2),
      offsetY: rect.center.y - (to.y + to.height / 2),
    },
    to,
  );
}

export function isSamePlacement(a: ArtworkPlacement, b: ArtworkPlacement): boolean {
  if (a.extendToBottom !== b.extendToBottom) return false;
  if (a.mode === 'FILL' || b.mode === 'FILL') return a.mode === b.mode;
  return (
    a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale && a.rotation === b.rotation
  );
}
