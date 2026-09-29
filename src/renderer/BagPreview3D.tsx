import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { getHandleLayout } from '../domain/geometry/handles';
import type { BagConfiguration } from '../domain/types';
import { BagModel } from './BagModel';
import { MM_TO_SCENE } from './constants';
import { BACKGROUND_COLOR, CAMERA_FOV, DEFAULT_VIEW_DIRECTION, fitDistance } from './camera';
import { StudioLighting } from './lighting';

// Pure view of the configuration: receives it (and the view-only fold state) as props, never writes back.

type ControlsLike = { target: Vector3; minDistance: number; maxDistance: number; update: () => void };

/**
 * Re-targets the orbit controls on the bag centre and fits the camera distance whenever the bag size changes,
 * keeping the user's current viewing direction. Zoom is clamped relative to the bag size.
 */
function CameraFit({ w, h, d }: { w: number; h: number; d: number }) {
  const get = useThree((s) => s.get);
  // Subscribed only to re-run the fit once OrbitControls registers as the default controls.
  const controlsReady = useThree((s) => s.controls !== null);

  useEffect(() => {
    const state = get();
    const camera = state.camera as PerspectiveCamera;
    const controls = state.controls as unknown as ControlsLike | null;
    const target = new Vector3(0, h / 2, 0);
    const radius = 0.5 * Math.hypot(w, h, d);
    const distance = fitDistance(camera, radius);
    const direction = controls ? camera.position.clone().sub(controls.target) : DEFAULT_VIEW_DIRECTION.clone();
    if (direction.lengthSq() < 1e-9) direction.copy(DEFAULT_VIEW_DIRECTION);
    camera.position.copy(target).addScaledVector(direction.normalize(), distance);
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = radius * 1.1;
      controls.maxDistance = distance * 3;
      controls.update();
    }
  }, [w, h, d, get, controlsReady]);

  return null;
}

export type BagPreview3DProps = {
  configuration: BagConfiguration;
  /** View-only fold state 0..1 (preview store, not part of BagConfiguration). */
  foldProgress?: number;
};

export function BagPreview3D({ configuration, foldProgress = 0 }: BagPreview3DProps) {
  const { dimensions, paper } = configuration;
  const [w, h, d] = [dimensions.width * MM_TO_SCENE, dimensions.height * MM_TO_SCENE, dimensions.depth * MM_TO_SCENE];
  const { handle } = configuration;
  // Handle loops stick out above the top edge: include them in the camera fit.
  const loopHeight = useMemo(
    () => (handle ? getHandleLayout(handle, dimensions).loopHeight * MM_TO_SCENE : 0),
    [handle, dimensions],
  );

  return (
    <Canvas camera={{ position: DEFAULT_VIEW_DIRECTION.clone().multiplyScalar(7.5).toArray(), fov: CAMERA_FOV }}>
      <color attach="background" args={[BACKGROUND_COLOR]} />

      <StudioLighting />

      <BagModel
        dimensions={dimensions}
        paperColor={paper.color}
        panels={configuration.panels}
        handle={configuration.handle}
        foldProgress={foldProgress}
      />

      {/* Slightly below the bag bottom so the shadow plane never z-fights with it (visible through the open top). */}
      <ContactShadows position={[0, -0.002, 0]} opacity={0.45} scale={Math.max(w, d) * 4} blur={2.4} far={h} />
      <OrbitControls makeDefault />
      <CameraFit w={w} h={h + loopHeight} d={d} />
    </Canvas>
  );
}
