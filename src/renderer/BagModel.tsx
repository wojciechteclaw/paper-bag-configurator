import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, FrontSide, type InterleavedBufferAttribute } from 'three';
import { FILL_PLACEMENT } from '../domain/artworkPlacement';
import { getPanelSize } from '../domain/panels';
import type { BagPanel, BagPanels, Dimensions, Handle, PaperColor } from '../domain/types';
import {
  BAG_PANEL_IDS,
  createPanelMesh,
  getBagFrame,
  getCreaseSpecs,
  getEdgeSpecs,
  updatePanelMesh,
  writeLineSegments,
  type BagFrame,
  type PanelMesh,
} from './bagGeometry';
import { PAPER_PALETTES, type PaperPalette } from './constants';
import { getHandleWallPose, HANDLE_WALLS } from './handleGeometry';
import { HandleModel, type HandleWallGroups } from './HandleModel';
import { ARTWORK_PROGRAM_KEY, clipArtworkToImage, usePanelTexture, usePanelUvTransform } from './panelTexture';

// Procedural block-bottom bag body. Face mapping (see bagGeometry.ts):
//   FRONT → +Z, BACK → −Z, LEFT → −X, RIGHT → +X, BOTTOM → −Y; the top is open (no top face, no turn-in).
// Each panel is its own mesh with its own outer material, so every PanelPosition maps to exactly one artwork
// texture (UVs continuous across the fold regions of the panel). The bottom has no artwork (plain paper).
// Handles (HandleModel) are two wall groups posed here together with the panels, so they follow the fold: FRONT, and
// the rigid BACK_UPPER region above the pleat (handleGeometry.ts).

/** Exponential damping rate of the fold animation (1/s). Higher = snappier. */
const FOLD_DAMPING = 6;
const FOLD_EPSILON = 1e-4;

type LineRef = ComponentRef<typeof Line>;

type BagModelProps = {
  dimensions: Dimensions;
  paperColor: PaperColor;
  /** Per-panel artwork and placement (from BagConfiguration). */
  panels: BagPanels;
  /** Internal handle (FRONT + BACK) or null. */
  handle: Handle | null;
  /** Target fold state 0..1 (view state); the model animates towards it. */
  foldProgress: number;
};

function writeLine(line: LineRef | null, specs: Parameters<typeof writeLineSegments>[0], frame: BagFrame) {
  if (!line) return;
  const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute | undefined;
  if (!start || start.data.array.length !== specs.length * 6) return;
  writeLineSegments(specs, frame, start.data.array as Float32Array);
  start.data.needsUpdate = true;
}

/** Placeholder points so drei allocates line buffers of the right size; real positions are written in place. */
const placeholderPoints = (segments: number) =>
  Array.from({ length: segments * 2 }, (): [number, number, number] => [0, 0, 0]);

const PAPER_MATERIAL = { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 } as const;
// Push faces back in depth so edge/crease lines drawn on them never z-fight.
const POLYGON_OFFSET = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } as const;
const artworkProgramKey = () => ARTWORK_PROGRAM_KEY;

type PanelViewProps = {
  mesh: PanelMesh;
  palette: PaperPalette;
  dimensions: Dimensions;
  panel: BagPanel | null;
};

/** One panel: outer face (artwork or paper) + inner face (always plain paper, visible through the open top). */
function PanelView({ mesh, palette, dimensions, panel }: PanelViewProps) {
  const artwork = panel?.artwork ?? null;
  const texture = usePanelTexture(artwork?.fileUrl);
  const panelSize = panel ? getPanelSize(panel.position, dimensions) : { width: 0, height: 0 };
  usePanelUvTransform(texture, panelSize, artwork?.width ?? 0, artwork?.height ?? 0, panel?.placement ?? FILL_PLACEMENT);

  return (
    <group name={`panel-${mesh.id}`}>
      <mesh geometry={mesh.geometry} userData={{ panel: mesh.id, side: 'outer' }}>
        {texture ? (
          // New material per texture: switching map on/off needs a shader recompile.
          <meshStandardMaterial
            key={texture.uuid}
            color={palette.paper}
            map={texture}
            side={FrontSide}
            onBeforeCompile={clipArtworkToImage}
            customProgramCacheKey={artworkProgramKey}
            {...PAPER_MATERIAL}
            {...POLYGON_OFFSET}
          />
        ) : (
          <meshStandardMaterial key="paper" color={palette.paper} side={FrontSide} {...PAPER_MATERIAL} {...POLYGON_OFFSET} />
        )}
      </mesh>
      <mesh geometry={mesh.geometry} userData={{ panel: mesh.id, side: 'inner' }}>
        <meshStandardMaterial color={palette.paper} side={BackSide} {...PAPER_MATERIAL} {...POLYGON_OFFSET} />
      </mesh>
    </group>
  );
}

export function BagModel({ dimensions, paperColor, panels, handle, foldProgress }: BagModelProps) {
  const { width, height, depth } = dimensions;
  const dims = useMemo(() => ({ width, height, depth }), [width, height, depth]);
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.WHITE;

  const meshes = useMemo(() => BAG_PANEL_IDS.map((id) => createPanelMesh(id, dims)), [dims]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);

  const edgeSpecs = useMemo(() => getEdgeSpecs(dims), [dims]);
  const creaseSpecs = useMemo(() => getCreaseSpecs(dims), [dims]);
  const edgePoints = useMemo(() => placeholderPoints(edgeSpecs.length), [edgeSpecs]);
  const creasePoints = useMemo(() => placeholderPoints(creaseSpecs.length), [creaseSpecs]);

  const edgesRef = useRef<LineRef>(null);
  const creasesRef = useRef<LineRef>(null);
  /** Currently displayed (animated) fold progress. Starts at the target: no animation on first mount. */
  const current = useRef(foldProgress);

  const handleGroups = useRef<HandleWallGroups>({ FRONT: null, BACK: null });

  const pose = useCallback(
    (progress: number) => {
      const frame = getBagFrame(dims, progress);
      for (const mesh of meshes) updatePanelMesh(mesh, frame);
      writeLine(edgesRef.current, edgeSpecs, frame);
      writeLine(creasesRef.current, creaseSpecs, frame);
      for (const wall of HANDLE_WALLS) {
        const group = handleGroups.current[wall];
        if (!group) continue;
        const { z, rotationY, squash } = getHandleWallPose(frame, wall, group.userData.stackThickness ?? 0);
        group.position.set(0, 0, z);
        group.rotation.set(0, rotationY, 0);
        group.scale.set(1, 1, squash);
      }
    },
    [dims, meshes, edgeSpecs, creaseSpecs],
  );

  // New geometry (dimension change), new line buffers or (re)mounted handles → pose them before the browser paints.
  useLayoutEffect(() => {
    pose(current.current);
  }, [pose, edgePoints, creasePoints, handle]);

  useFrame((_, delta) => {
    const target = Math.min(1, Math.max(0, Number.isFinite(foldProgress) ? foldProgress : 0));
    const diff = target - current.current;
    if (diff === 0) return;
    const next =
      Math.abs(diff) < FOLD_EPSILON ? target : current.current + diff * (1 - Math.exp(-FOLD_DAMPING * delta));
    current.current = next;
    pose(next);
  });

  return (
    <group name="bag">
      {meshes.map((mesh) => (
        <PanelView
          key={mesh.id}
          mesh={mesh}
          palette={palette}
          dimensions={dims}
          panel={mesh.id === 'BOTTOM' ? null : panels[mesh.id]}
        />
      ))}

      {handle && <HandleModel handle={handle} dimensions={dims} wallGroups={handleGroups} />}

      {/* Positions are rewritten in place every pose; bounding volumes are stale, so skip frustum culling. */}
      <Line ref={edgesRef} segments points={edgePoints} color={palette.edge} lineWidth={1} frustumCulled={false} />
      <Line
        ref={creasesRef}
        segments
        points={creasePoints}
        color={palette.crease}
        lineWidth={1}
        transparent
        opacity={0.7}
        frustumCulled={false}
      />
    </group>
  );
}
