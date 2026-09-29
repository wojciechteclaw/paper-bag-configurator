import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

// Camera constants and fitting shared by the interactive preview (BagPreview3D) and the offscreen snapshots.

export const CAMERA_FOV = 40;
/** Default viewing direction (front-right, slightly above). */
export const DEFAULT_VIEW_DIRECTION = new Vector3(4, 3, 6).normalize();
/** Extra room around the bag's bounding sphere when fitting the camera. */
export const FIT_MARGIN = 1.15;
export const BACKGROUND_COLOR = '#eeeeec';

/** Distance at which a sphere of `radius` fits the camera's narrower field of view. */
export function fitDistance(camera: Pick<PerspectiveCamera, 'fov' | 'aspect'>, radius: number): number {
  const vFov = MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1));
  return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * FIT_MARGIN;
}
