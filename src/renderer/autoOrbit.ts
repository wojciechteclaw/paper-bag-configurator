import { MathUtils } from 'three';

// Automatic camera orbit of the 3D preview (client, 30.09.2026): a full 360° turn around the bag while the camera also
// moves in the second direction, from 45° above the bag down to 45° below it and back — one elevation cycle per turn.
// Angles in radians; azimuth around the vertical axis, elevation above (+) / below (−) the horizontal plane through
// the orbit target (the middle of the bag).

/** Seconds for one full 360° turn (and one elevation cycle). */
export const ORBIT_PERIOD_S = 14;
/** Highest / lowest camera elevation during the orbit. */
export const ORBIT_MAX_ELEVATION = MathUtils.degToRad(45);

export type OrbitPose = { azimuth: number; elevation: number };

/**
 * Phase of the elevation sine wave that starts the orbit at `elevation` (clamped to ±ORBIT_MAX_ELEVATION), heading
 * upwards — so starting the orbit never makes the camera jump.
 */
export function orbitStartPhase(elevation: number): number {
  return Math.asin(MathUtils.clamp(elevation / ORBIT_MAX_ELEVATION, -1, 1));
}

/**
 * Camera angles `elapsed` seconds into an orbit that started at `start.azimuth` with elevation phase `startPhase`:
 * the azimuth grows linearly (360° per ORBIT_PERIOD_S), the elevation follows a sine between ±ORBIT_MAX_ELEVATION
 * with the same period.
 */
export function orbitPose(start: { azimuth: number; phase: number }, elapsed: number): OrbitPose {
  const turn = (2 * Math.PI * elapsed) / ORBIT_PERIOD_S;
  return {
    azimuth: start.azimuth + turn,
    elevation: ORBIT_MAX_ELEVATION * Math.sin(start.phase + turn),
  };
}

/** Unit direction from the orbit target to the camera for a pose (y up; azimuth 0 looks from +z). */
export function orbitDirection({ azimuth, elevation }: OrbitPose): [number, number, number] {
  const horizontal = Math.cos(elevation);
  return [horizontal * Math.sin(azimuth), Math.sin(elevation), horizontal * Math.cos(azimuth)];
}

/** Azimuth and elevation of a direction from the target to the camera (inverse of `orbitDirection`). */
export function poseOfDirection([x, y, z]: [number, number, number]): OrbitPose {
  const length = Math.hypot(x, y, z) || 1;
  return { azimuth: Math.atan2(x, z), elevation: Math.asin(MathUtils.clamp(y / length, -1, 1)) };
}
