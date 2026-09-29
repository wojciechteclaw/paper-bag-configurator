import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from 'three';
import type { BagConfiguration } from '../domain/types';
import { BagModel } from './BagModel';
import { MM_TO_SCENE } from './constants';

// Pure view of the configuration: receives it (and the view-only fold state) as props, never writes back.

const CAMERA_FOV = 40;
/** Default viewing direction (front-right, slightly above). */
const DEFAULT_VIEW_DIRECTION = new Vector3(4, 3, 6).normalize();
/** Extra room around the bag's bounding sphere when fitting the camera. */
const FIT_MARGIN = 1.15;

/**
 * Key/fill/rim lights expressed in camera space and rotated with the camera, so whichever side the user
 * orbits to is lit the same way (key from upper-left of the viewer) and adjacent faces keep distinct shading.
 * Lights aim at the world origin (their default target), which is close to the bag.
 */
function CameraFollowingLights() {
  const rig = useRef<Group>(null);
  useFrame(({ camera }) => {
    rig.current?.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={rig}>
      <directionalLight position={[-3, 4, 5]} intensity={1.6} />
      <directionalLight position={[4, 0.5, 3]} intensity={0.45} />
      <directionalLight position={[0, 3, -6]} intensity={0.7} />
    </group>
  );
}

type ControlsLike = { target: Vector3; minDistance: number; maxDistance: number; update: () => void };

/** Distance at which a sphere of `radius` fits the camera's narrower field of view. */
function fitDistance(camera: PerspectiveCamera, radius: number): number {
  const vFov = MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1));
  return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * FIT_MARGIN;
}

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

  return (
    <Canvas camera={{ position: DEFAULT_VIEW_DIRECTION.clone().multiplyScalar(7.5).toArray(), fov: CAMERA_FOV }}>
      <color attach="background" args={['#eeeeec']} />

      {/* Low ambient so faces facing different directions read with different brightness. */}
      <hemisphereLight args={['#ffffff', '#b9b4aa', 0.35]} />
      {/* No shadow maps: self-shadowing a double-sided paper wall causes shadow acne; ContactShadows grounds the bag. */}
      <CameraFollowingLights />

      {/* Local studio environment (no HDR download) for soft reflections on the paper. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[5, 1, -2]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} />
      </Environment>

      <BagModel
        dimensions={dimensions}
        paperColor={paper.color}
        panels={configuration.panels}
        foldProgress={foldProgress}
      />
      {/* TODO(3d-renderer): <HandleModel handle={configuration.handle} … /> — handles are not implemented yet. */}

      {/* Slightly below the bag bottom so the shadow plane never z-fights with it (visible through the open top). */}
      <ContactShadows position={[0, -0.002, 0]} opacity={0.45} scale={Math.max(w, d) * 4} blur={2.4} far={h} />
      <OrbitControls makeDefault />
      <CameraFit w={w} h={h} d={d} />
    </Canvas>
  );
}
