import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

// Shared studio lighting rig of the interactive preview (BagPreview3D) and the offscreen snapshots
// (snapshot.tsx), so exported 3D views look exactly like the preview.

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

/** Low hemisphere ambient + camera-following key/fill/rim lights + a local Lightformer environment (no HDR download). */
export function StudioLighting() {
  return (
    <>
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
    </>
  );
}
