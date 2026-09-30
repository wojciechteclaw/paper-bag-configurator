import { describe, expect, it } from 'vitest';
import {
  ORBIT_MAX_ELEVATION,
  ORBIT_PERIOD_S,
  orbitDirection,
  orbitPose,
  orbitStartPhase,
  poseOfDirection,
} from '../../src/renderer/autoOrbit';

const deg = (rad: number) => (rad * 180) / Math.PI;

describe('automatic camera orbit', () => {
  it('turns a full 360° around the bag per period', () => {
    const start = { azimuth: 0.3, phase: 0 };
    expect(orbitPose(start, 0).azimuth).toBeCloseTo(0.3);
    expect(orbitPose(start, ORBIT_PERIOD_S / 4).azimuth - 0.3).toBeCloseTo(Math.PI / 2);
    expect(orbitPose(start, ORBIT_PERIOD_S).azimuth - 0.3).toBeCloseTo(2 * Math.PI);
  });

  it('sweeps the elevation from 45° above to 45° below the bag and back within one turn', () => {
    const start = { azimuth: 0, phase: 0 };
    const elevations = Array.from({ length: 97 }, (_, i) => deg(orbitPose(start, (i / 96) * ORBIT_PERIOD_S).elevation));
    expect(Math.max(...elevations)).toBeCloseTo(45);
    expect(Math.min(...elevations)).toBeCloseTo(-45);
    expect(elevations[0]).toBeCloseTo(0);
    expect(elevations[96]).toBeCloseTo(0);
  });

  it('starts from the current camera elevation (no jump), clamping views outside ±45°', () => {
    for (const elevation of [-0.5, 0, 0.2, 0.7]) {
      expect(orbitPose({ azimuth: 0, phase: orbitStartPhase(elevation) }, 0).elevation).toBeCloseTo(elevation);
    }
    expect(orbitPose({ azimuth: 0, phase: orbitStartPhase(1.2) }, 0).elevation).toBeCloseTo(ORBIT_MAX_ELEVATION);
    expect(orbitPose({ azimuth: 0, phase: orbitStartPhase(-1.2) }, 0).elevation).toBeCloseTo(-ORBIT_MAX_ELEVATION);
  });

  it('converts between poses and camera directions', () => {
    const pose = { azimuth: 1.1, elevation: -0.4 };
    const direction = orbitDirection(pose);
    expect(Math.hypot(...direction)).toBeCloseTo(1);
    expect(direction[1]).toBeLessThan(0); // below the bag
    const back = poseOfDirection([direction[0] * 5, direction[1] * 5, direction[2] * 5]);
    expect(back.azimuth).toBeCloseTo(pose.azimuth);
    expect(back.elevation).toBeCloseTo(pose.elevation);
    expect(orbitDirection({ azimuth: 0, elevation: 0 })).toEqual([0, 0, 1]);
  });
});
