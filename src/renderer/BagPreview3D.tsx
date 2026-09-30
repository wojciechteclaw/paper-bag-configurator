import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { resolvePanelArtworks } from '../domain/artworkLayout';
import { getHandleLayout } from '../domain/geometry/handles';
import type { BagConfiguration } from '../domain/types';
import { getSheetViewExtent } from './assemblyGeometry';
import { BagModel } from './BagModel';
import { getGlueFlapWidth } from '../domain/glueFlap';
import { getConfiguredBottomFold } from '../domain/bottomFold';
import { getWindow } from '../domain/window';
import { GussetedBagModel } from './GussetedBagModel';
import { getGussetedSheetViewExtent } from './gussetedBagGeometry';
import { GUSSETED_PHASES, toGussetedTimeline } from '../domain/geometry/gussetedAssembly';
import { CONTACT_SHADOW_DEPTH_MM, MM_TO_SCENE } from './constants';
import { BACKGROUND_COLOR, CAMERA_FOV, DEFAULT_VIEW_DIRECTION, fitDistance } from './camera';
import { StudioLighting } from './lighting';

// Pure view of the configuration: receives it (and the view-only timeline state) as props, never writes back.

type ControlsLike = { target: Vector3; minDistance: number; maxDistance: number; update: () => void };

/** Seconds of the camera glide between the bag fit and the (larger) flat-sheet fit. */
const CAMERA_GLIDE_S = 0.7;

type Glide = { fromTarget: Vector3; toTarget: Vector3; fromDistance: number; toDistance: number; radius: number; t: number };

/**
 * Re-targets the orbit controls on the model centre and fits the camera distance to the bounding `radius` (scene
 * units) whenever it changes, keeping the user's current viewing direction. The first fit (and the one right after the
 * controls register) is immediate; later ones — a new size, or switching between the formed bag and the much larger
 * flat sheet of the assembly — glide over CAMERA_GLIDE_S. Zoom is clamped relative to the fitted size.
 */
function CameraFit({ targetY, radius }: { targetY: number; radius: number }) {
  const get = useThree((s) => s.get);
  // Subscribed only to re-run the fit once OrbitControls registers as the default controls.
  const controlsReady = useThree((s) => s.controls !== null);
  const glide = useRef<Glide | null>(null);
  const fittedWithControls = useRef(false);

  useEffect(() => {
    const state = get();
    const camera = state.camera as PerspectiveCamera;
    const controls = state.controls as unknown as ControlsLike | null;
    const target = new Vector3(0, targetY, 0);
    const distance = fitDistance(camera, radius);
    if (!controls || !fittedWithControls.current) {
      const direction = controls ? camera.position.clone().sub(controls.target) : DEFAULT_VIEW_DIRECTION.clone();
      if (direction.lengthSq() < 1e-9) direction.copy(DEFAULT_VIEW_DIRECTION);
      camera.position.copy(target).addScaledVector(direction.normalize(), distance);
      if (controls) {
        controls.target.copy(target);
        controls.minDistance = radius * 1.1;
        controls.maxDistance = distance * 3;
        controls.update();
        fittedWithControls.current = true;
      }
      return;
    }
    controls.minDistance = Math.min(controls.minDistance, radius * 1.1);
    controls.maxDistance = Math.max(controls.maxDistance, distance * 3);
    glide.current = {
      fromTarget: controls.target.clone(),
      toTarget: target,
      fromDistance: camera.position.distanceTo(controls.target),
      toDistance: distance,
      radius,
      t: 0,
    };
  }, [targetY, radius, get, controlsReady]);

  useFrame((state, delta) => {
    const g = glide.current;
    const controls = state.controls as unknown as ControlsLike | null;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + delta / CAMERA_GLIDE_S);
    const k = g.t * g.t * (3 - 2 * g.t);
    const direction = state.camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-9) direction.copy(DEFAULT_VIEW_DIRECTION);
    controls.target.lerpVectors(g.fromTarget, g.toTarget, k);
    state.camera.position
      .copy(controls.target)
      .addScaledVector(direction.normalize(), g.fromDistance + (g.toDistance - g.fromDistance) * k);
    if (g.t >= 1) {
      controls.minDistance = g.radius * 1.1;
      controls.maxDistance = g.toDistance * 3;
      glide.current = null;
    }
    controls.update();
  });

  return null;
}

export type BagPreview3DProps = {
  configuration: BagConfiguration;
  /** View-only fold state 0..1: formed open bag → folded flat (preview store, not part of BagConfiguration). */
  foldProgress?: number;
  /** View-only assembly state 0..1: flat sheet → formed open bag (default 1 = formed). */
  assemblyProgress?: number;
};

/** Dev aid: `?lines` in the URL numbers the bottom-zone edges during the assembly (to discuss folds with the client). */
const DEBUG_LINES = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lines');

export function BagPreview3D({ configuration, foldProgress = 0, assemblyProgress = 1 }: BagPreview3DProps) {
  const { dimensions, paper } = configuration;
  const [w, h, d] = [dimensions.width * MM_TO_SCENE, dimensions.height * MM_TO_SCENE, dimensions.depth * MM_TO_SCENE];
  const { handle } = configuration;
  // Handle loops stick out above the top edge: include them in the camera fit.
  const loopHeight = useMemo(
    () => (handle ? getHandleLayout(handle, dimensions).loopHeight * MM_TO_SCENE : 0),
    [handle, dimensions],
  );
  const glueFlapWidth = getGlueFlapWidth(configuration);
  // The gusseted bag (FOLDED) has its own model and timeline: forming from the sheet, then opening (docs/SPEC.md §4i).
  const gusseted = configuration.productType === 'FOLDED';
  const bottomFold = getConfiguredBottomFold(configuration);
  const sheet = useMemo(
    () =>
      gusseted
        ? getGussetedSheetViewExtent({ ...dimensions, bottomFold }, glueFlapWidth)
        : getSheetViewExtent(dimensions, glueFlapWidth),
    [gusseted, dimensions, bottomFold, glueFlapWidth],
  );
  const artworks = useMemo(() => resolvePanelArtworks(configuration), [configuration]);
  // While the sheet is spread (block bottom: the whole assembly; gusseted: until BACK has wrapped), fit the (flat,
  // much wider) sheet; otherwise the bag.
  const assembling = gusseted
    ? toGussetedTimeline(assemblyProgress, foldProgress) < GUSSETED_PHASES.WRAP[1]
    : assemblyProgress < 1;
  const bagHeight = h + loopHeight;
  const radius = assembling
    ? Math.max(sheet.radius * MM_TO_SCENE, 0.5 * Math.hypot(w, bagHeight, d))
    : 0.5 * Math.hypot(w, bagHeight, d);
  const targetY = assembling ? Math.max(sheet.centreY * MM_TO_SCENE, bagHeight / 2) : bagHeight / 2;

  return (
    <Canvas camera={{ position: DEFAULT_VIEW_DIRECTION.clone().multiplyScalar(7.5).toArray(), fov: CAMERA_FOV }}>
      <color attach="background" args={[BACKGROUND_COLOR]} />

      <StudioLighting />

      {gusseted ? (
        <GussetedBagModel
          dimensions={dimensions}
          bottomFoldDepth={bottomFold}
          glueFlapWidth={glueFlapWidth}
          paperColor={paper.color}
          artworks={artworks}
          foldProgress={foldProgress}
          assemblyProgress={assemblyProgress}
          window={getWindow(configuration)}
        />
      ) : (
        <BagModel
          dimensions={dimensions}
          glueFlapWidth={glueFlapWidth}
          paperColor={paper.color}
          artworks={artworks}
          handle={configuration.handle}
          foldProgress={foldProgress}
          assemblyProgress={assemblyProgress}
          debugLines={DEBUG_LINES}
        />
      )}

      {/* Below every bottom layer so the shadow plane never draws over the bottom seen through the open top. */}
      <ContactShadows position={[0, -CONTACT_SHADOW_DEPTH_MM * MM_TO_SCENE, 0]} opacity={0.45} scale={Math.max(w, d, assembling ? 2 * sheet.radius * MM_TO_SCENE : 0) * 4} blur={2.4} far={h} />
      <OrbitControls makeDefault />
      <CameraFit targetY={targetY} radius={radius} />
    </Canvas>
  );
}
