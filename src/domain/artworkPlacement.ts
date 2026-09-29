// Artwork positioning module (docs/SPEC.md §3, §4b). Pure TS: no React, no Three.js.
//
// One definition of "where is the image on the wall" shared by the 3D renderer (texture UV transform) and the
// 2D dieline (SVG image matrix): the dieline derives its image matrix from `computePanelUvTransform`, so both
// views always show the same result.
//
// Coordinates:
// - panel-local mm, seen from outside, origin bottom-left of the VISIBLE wall (bottom line y = 0), y up;
// - panel UV = (x / panelWidth, y / panelHeight) — what the renderer's wall geometry uses;
// - texture coordinates t ∈ [0,1]², t = (0,0) at the image's bottom-left (three.js `flipY = true` convention).

import { ARTWORK_PLACEMENT_RULES } from './config/productionRules';
import type { ArtworkPlacement, ArtworkRotation } from './types';

export type Size2 = { width: number; height: number };

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

export const FILL_PLACEMENT: ArtworkPlacement = { mode: 'FILL' };

const ROTATIONS: readonly ArtworkRotation[] = [0, 90, 180, 270];
// Exact cos/sin for the 90° steps (avoids 6e-17 noise in transforms).
const COS: Record<ArtworkRotation, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<ArtworkRotation, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

const isPositiveSize = (size: Size2) =>
  Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** mm per image pixel so the whole image fits the wall (touching two edges). Rotation-aware (90°/270° swap). */
function containMmPerPixel(panel: Size2, image: Size2, rotation: ArtworkRotation): number {
  const quarter = rotation === 90 || rotation === 270;
  const iw = quarter ? image.height : image.width;
  const ih = quarter ? image.width : image.height;
  return Math.min(panel.width / iw, panel.height / ih);
}

/** Scale (relative to contain) at which the image covers the whole wall. ≥ 1. */
export function getCoverScale(panel: Size2, image: Size2, rotation: ArtworkRotation = 0): number {
  if (!isPositiveSize(panel) || !isPositiveSize(image)) return 1;
  const quarter = rotation === 90 || rotation === 270;
  const iw = quarter ? image.height : image.width;
  const ih = quarter ? image.width : image.height;
  const contain = Math.min(panel.width / iw, panel.height / ih);
  const cover = Math.max(panel.width / iw, panel.height / ih);
  return cover / contain;
}

/** Image rectangle on the wall (panel-local mm). FILL = the whole wall. */
export function getArtworkRect(panel: Size2, image: Size2, placement: ArtworkPlacement): ArtworkRect {
  const wallCentre = { x: panel.width / 2, y: panel.height / 2 };
  if (placement.mode === 'FILL' || !isPositiveSize(panel) || !isPositiveSize(image)) {
    return { center: wallCentre, width: panel.width, height: panel.height, rotation: 0 };
  }
  const k = containMmPerPixel(panel, image, placement.rotation) * placement.scale;
  return {
    center: { x: wallCentre.x + placement.offsetX, y: wallCentre.y + placement.offsetY },
    width: image.width * k,
    height: image.height * k,
    rotation: placement.rotation,
  };
}

/**
 * Texture transform for `placement` of an image of `imageSize` px on a wall of `panelSize` mm.
 * FILL → repeat [1,1], offset [0,0], rotation 0. Signature is a stable contract with the renderer.
 */
export function computePanelUvTransform(
  panelSize: Size2,
  imageSize: Size2,
  placement: ArtworkPlacement,
): PanelUvTransform {
  if (placement.mode === 'FILL' || !isPositiveSize(panelSize) || !isPositiveSize(imageSize)) {
    return { repeat: [1, 1], offset: [0, 0], rotation: 0 };
  }
  const { center, width: w, height: h, rotation } = getArtworkRect(panelSize, imageSize, placement);
  const c = COS[rotation];
  const s = SIN[rotation];
  const quarter = rotation === 90 || rotation === 270;
  // diag(repeat)·R(−θ) must equal diag(1/w, 1/h)·R(−θ)·diag(Pw, Ph); for 90° steps R swaps the axes.
  const repeat: [number, number] = quarter
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

// ——— Editing helpers (pure; the store applies them) ———

/** Image fitted inside the wall, centred, aspect ratio kept. */
export function containPlacement(rotation: ArtworkRotation = 0): ArtworkPlacement {
  return { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation };
}

/** Image covering the whole wall, centred, aspect ratio kept (overflow is cropped). */
export function coverPlacement(panel: Size2, image: Size2, rotation: ArtworkRotation = 0): ArtworkPlacement {
  return { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: getCoverScale(panel, image, rotation), rotation };
}

/** FILL becomes a centred contain placement (the starting point of any manual edit). */
export function toCustomPlacement(placement: ArtworkPlacement): Extract<ArtworkPlacement, { mode: 'CUSTOM' }> {
  return placement.mode === 'CUSTOM' ? placement : { mode: 'CUSTOM', offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
}

/**
 * Brings a placement into the allowed set: scale clamped to the rules, the image centre kept on the wall
 * (so the image never disappears entirely), rotation snapped to 90° steps, non-finite numbers reset.
 */
export function normalizePlacement(placement: ArtworkPlacement, panel: Size2): ArtworkPlacement {
  if (placement.mode === 'FILL') return FILL_PLACEMENT;
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  const halfW = Math.max(0, panel.width / 2);
  const halfH = Math.max(0, panel.height / 2);
  const rotation = ROTATIONS.includes(placement.rotation)
    ? placement.rotation
    : ROTATIONS[((Math.round(finite(placement.rotation, 0) / 90) % 4) + 4) % 4];
  return {
    mode: 'CUSTOM',
    offsetX: clamp(finite(placement.offsetX, 0), -halfW, halfW),
    offsetY: clamp(finite(placement.offsetY, 0), -halfH, halfH),
    scale: clamp(finite(placement.scale, 1), ARTWORK_PLACEMENT_RULES.minScale, ARTWORK_PLACEMENT_RULES.maxScale),
    rotation,
  };
}

export function movePlacement(placement: ArtworkPlacement, dx: number, dy: number, panel: Size2): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  return normalizePlacement({ ...custom, offsetX: custom.offsetX + dx, offsetY: custom.offsetY + dy }, panel);
}

export function scalePlacement(placement: ArtworkPlacement, factor: number, panel: Size2): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  return normalizePlacement({ ...custom, scale: custom.scale * factor }, panel);
}

/** Rotates by 90° counter-clockwise (or clockwise with `direction = -1`), keeping the centre. */
export function rotatePlacement(placement: ArtworkPlacement, panel: Size2, direction: 1 | -1 = 1): ArtworkPlacement {
  const custom = toCustomPlacement(placement);
  const index = ROTATIONS.indexOf(custom.rotation);
  return normalizePlacement({ ...custom, rotation: ROTATIONS[(index + direction + 4) % 4] }, panel);
}

export function isSamePlacement(a: ArtworkPlacement, b: ArtworkPlacement): boolean {
  if (a.mode === 'FILL' || b.mode === 'FILL') return a.mode === b.mode;
  return (
    a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale && a.rotation === b.rotation
  );
}
