// Zoom / pan of the 2D dieline view box, and the two-finger pinch gesture that drives it on touch screens.

export type Point = [number, number];

/** Zoom factor over the fitted sheet and the view-box centre in SVG units (null = centre of the sheet). */
export type DielineViewState = { zoom: number; center: Point | null };

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 20;

/**
 * Zooms by `factor` (clamped to MIN_ZOOM…MAX_ZOOM) keeping the SVG point `around` (default: the view centre) fixed on
 * screen. `fallbackCenter` is the centre used while `view.center` is null (the fitted sheet).
 */
export function zoomView(view: DielineViewState, factor: number, fallbackCenter: Point, around?: Point): DielineViewState {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const f = next / view.zoom;
  if (f === 1) return view;
  const c = view.center ?? fallbackCenter;
  const p = around ?? c;
  return { zoom: next, center: [p[0] + (c[0] - p[0]) / f, p[1] + (c[1] - p[1]) / f] };
}

/** Moves the view centre by `delta` SVG units. */
export function panView(view: DielineViewState, delta: Point, fallbackCenter: Point): DielineViewState {
  const c = view.center ?? fallbackCenter;
  return { zoom: view.zoom, center: [c[0] + delta[0], c[1] + delta[1]] };
}

const midpoint = ([a, b]: [Point, Point]): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const distance = ([a, b]: [Point, Point]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * One step of a two-finger pinch between two sets of finger positions (screen px): the zoom factor (finger spread
 * ratio), the new midpoint to zoom around and how far the midpoint moved (to pan with it).
 */
export function pinchStep(previous: [Point, Point], next: [Point, Point]): { factor: number; midpoint: Point; pan: Point } {
  const before = distance(previous);
  const after = distance(next);
  const [m0, m1] = [midpoint(previous), midpoint(next)];
  return {
    factor: before > 0 && after > 0 ? after / before : 1,
    midpoint: m1,
    pan: [m1[0] - m0[0], m1[1] - m0[1]],
  };
}
