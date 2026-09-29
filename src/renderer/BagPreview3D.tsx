import { ContactShadows, Edges, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { DoubleSide, type Group } from 'three';
import type { BagConfiguration } from '../domain/types';

// Pure view of the configuration: receives it as a prop, never writes back.
// Scaffold only — BagModel/HandleModel with per-panel textures are implemented by the 3d-renderer agent.
const MM_TO_SCENE = 0.01;
const PAPER_COLOR = '#c8a57a';
const EDGE_COLOR = '#6e5436';

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

export function BagPreview3D({ configuration }: { configuration: BagConfiguration }) {
  const { width, height, depth } = configuration.dimensions;
  const [w, h, d] = [width * MM_TO_SCENE, height * MM_TO_SCENE, depth * MM_TO_SCENE];

  return (
    <Canvas camera={{ position: [4, 3, 6], fov: 40 }}>
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

      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        {/* BoxGeometry face order: +X, -X, +Y (top), -Y, +Z, -Z. The top is open. */}
        {[0, 1, 2, 3, 4, 5].map((face) => (
          <meshStandardMaterial
            key={face}
            attach={`material-${face}`}
            color={PAPER_COLOR}
            roughness={0.85}
            metalness={0}
            envMapIntensity={0.4}
            side={DoubleSide}
            visible={face !== 2}
          />
        ))}
        <Edges threshold={15} color={EDGE_COLOR} lineWidth={1} />
      </mesh>

      {/* Slightly below the bag bottom so the shadow plane never z-fights with it (visible through the open top). */}
      <ContactShadows position={[0, -0.002, 0]} opacity={0.45} scale={Math.max(w, d) * 4} blur={2.4} far={h} />
      <OrbitControls makeDefault target={[0, h / 2, 0]} />
    </Canvas>
  );
}
