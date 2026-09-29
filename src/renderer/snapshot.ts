import { advance, createRoot, type RootState } from '@react-three/fiber';
import { createElement } from 'react';
import { Vector3, type Material, type Mesh, type PerspectiveCamera } from 'three';
import { getHandleLayout } from '../domain/geometry/handles';
import type { BagConfiguration, PanelPosition } from '../domain/types';
import { MM_TO_SCENE } from './constants';
import { CAMERA_FOV, fitDistance } from './camera';
import { SnapshotScene } from './SnapshotScene';

// Offscreen 3D snapshots for the product sheet (docs/SPEC.md §4e). Renders the same BagModel + lighting rig as the
// interactive preview into its own detached canvas / WebGLRenderer / scene / camera (a separate R3F root with
// `frameloop: 'never'`), waits for the artwork textures, then captures one image per requested view. The
// configuration comes in as an argument — this module never reads a store. Everything is disposed afterwards.

/** Camera angle of a snapshot: 3/4 from the front-right or from the back-left, slightly above. */
export type SnapshotAngle = 'FRONT_3_4' | 'BACK_3_4';

export type SnapshotView = {
  foldProgress: number;
  angle: SnapshotAngle;
};

export type SnapshotOptions = {
  /** Output size in px (default 1200 × 900). */
  width?: number;
  height?: number;
  /** `image/png` (default) or `image/jpeg` (much smaller, for the PDF). */
  mimeType?: 'image/png' | 'image/jpeg';
  quality?: number;
  /** Max time to wait for artwork textures before capturing with plain paper, ms. */
  textureTimeoutMs?: number;
  /** Called after each captured view (done, total). */
  onProgress?: (done: number, total: number) => void;
};

const ANGLE_DIRECTIONS: Record<SnapshotAngle, Vector3> = {
  FRONT_3_4: new Vector3(4, 3, 6).normalize(),
  BACK_3_4: new Vector3(-4, 3, -6).normalize(),
};

/** Simulated seconds per frame: large enough for BagModel's damped fold animation to settle in one or two frames. */
const FRAME_STEP_S = 5;
const SETTLE_FRAMES = 3;
/** Snapshots frame the bag tighter than the interactive preview (which leaves room for orbiting). */
const SNAPSHOT_ZOOM = 0.86;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the artwork URLs that can actually be decoded (failed ones render as plain paper). */
async function loadableArtworkPanels(configuration: BagConfiguration): Promise<PanelPosition[]> {
  const entries = Object.values(configuration.panels).filter((panel) => panel.artwork);
  const results = await Promise.all(
    entries.map(
      (panel) =>
        new Promise<PanelPosition | null>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(panel.position);
          image.onerror = () => resolve(null);
          image.src = panel.artwork!.fileUrl;
        }),
    ),
  );
  return results.filter((p): p is PanelPosition => p !== null);
}

/** True when every panel in `panels` has its artwork texture bound to the outer material. */
function texturesReady(state: RootState, panels: readonly PanelPosition[]): boolean {
  if (panels.length === 0) return true;
  const ready = new Set<string>();
  state.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.userData.side !== 'outer') return;
    const material = mesh.material as Material & { map?: unknown };
    if (material?.map) ready.add(String(mesh.userData.panel));
  });
  return panels.every((panel) => ready.has(panel));
}

/** Camera distance / target fitting the bag (incl. handle loops) for the snapshot aspect. */
function placeCamera(camera: PerspectiveCamera, configuration: BagConfiguration, angle: SnapshotAngle) {
  const { dimensions, handle } = configuration;
  const loop = handle ? getHandleLayout(handle, dimensions).loopHeight : 0;
  const w = dimensions.width * MM_TO_SCENE;
  const h = (dimensions.height + loop) * MM_TO_SCENE;
  const d = dimensions.depth * MM_TO_SCENE;
  const target = new Vector3(0, h / 2, 0);
  const distance = fitDistance(camera, 0.5 * Math.hypot(w, h, d)) * SNAPSHOT_ZOOM;
  camera.position.copy(target).addScaledVector(ANGLE_DIRECTIONS[angle], distance);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/**
 * Renders `views` of the bag offscreen and returns one data URL per view (same order). Views are grouped by fold
 * state so textures load once. Requires WebGL (browser only).
 */
export async function renderBagSnapshots(
  configuration: BagConfiguration,
  views: readonly SnapshotView[],
  options: SnapshotOptions = {},
): Promise<string[]> {
  const { width = 1200, height = 900, mimeType = 'image/png', quality = 0.9, textureTimeoutMs = 8000, onProgress } = options;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const root = createRoot(canvas);
  const results: string[] = new Array(views.length);
  let time = 0;

  try {
    await root.configure({
      // Keep alpha (clearAlpha 0): ContactShadows relies on a transparent clear of its render target; the scene
      // background colour still makes the captured image opaque.
      gl: { preserveDrawingBuffer: true, antialias: true },
      size: { width, height, top: 0, left: 0 },
      dpr: 1,
      frameloop: 'never',
      camera: { fov: CAMERA_FOV, position: [0, 0, 10] },
    });
    const artworkPanels = await loadableArtworkPanels(configuration);

    const order = views.map((view, index) => ({ view, index })).sort((a, b) => a.view.foldProgress - b.view.foldProgress);
    let done = 0;
    let first = true;
    for (const { view, index } of order) {
      // Wait until React has committed the new fold state (the reconciler may commit asynchronously).
      let store!: ReturnType<typeof root.render>;
      await new Promise<void>((resolve) => {
        const onCommit = (committed: number) => {
          if (committed === view.foldProgress) resolve();
        };
        store = root.render(createElement(SnapshotScene, { configuration, foldProgress: view.foldProgress, onCommit }));
      });
      if (first) {
        const deadline = Date.now() + textureTimeoutMs;
        while (!texturesReady(store.getState(), artworkPanels) && Date.now() < deadline) await wait(50);
        first = false;
      }
      const state = store.getState();
      placeCamera(state.camera as PerspectiveCamera, configuration, view.angle);
      for (let i = 0; i < SETTLE_FRAMES; i++) {
        time += FRAME_STEP_S;
        advance(time, false, store.getState());
      }
      results[index] = canvas.toDataURL(mimeType, quality);
      onProgress?.(++done, views.length);
    }
    return results;
  } finally {
    root.unmount();
  }
}
