import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, FrontSide, type BufferGeometry, type Group, type InterleavedBufferAttribute, type Texture } from 'three';
import { getHandlePaperColor } from '../domain/geometry/handles';
import { getPanelArtworkArea } from '../domain/artworkPlacement';
import { splitPreviewTimeline, toPreviewTimeline } from '../domain/geometry/assemblyKinematics';
import { getPanelSize } from '../domain/panels';
import type { BagPanel, BagPanels, Dimensions, Handle, PanelPosition, PaperColor } from '../domain/types';
import {
  createAssemblyMeshes,
  getAssemblyFrame,
  getAssemblyHandleMatrix,
  getAssemblyLineSpecs,
  updateAssemblyMesh,
  writeAssemblyLines,
  type AssemblyFrame,
  type AssemblyLineSpec,
  type AssemblyMesh,
} from './assemblyGeometry';
import {
  createBagMeshes,
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
// texture (UVs continuous across the fold regions of the panel). The bottom is one mesh per visible piece (BACK flap —
// outermost, client rule — and the visible part of the FRONT flap) in the UV space of the wall it is folded from: it
// shows that wall's texture (same object, same transform) only when the wall's placement extends to the bottom
// (SPEC §4f), otherwise plain paper.
// Two models share the textures and the handles: while the assembly from the sheet runs (assemblyProgress < 1) the
// sheet pieces of assemblyGeometry.ts are shown; from the formed bag on (assemblyProgress = 1) the fold model of
// bagGeometry.ts (BOX → flat). Both are posed from ONE damped timeline value, so presets animate through all phases.
// Handles (HandleModel) are two wall groups posed here together with the panels, so they follow the fold: FRONT, and
// the rigid BACK_UPPER region above the pleat (handleGeometry.ts); during the assembly they ride with FRONT / BACK.

/** Exponential damping rate of the timeline animation (1/s). Higher = snappier. */
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
  /** Target fold state 0..1 (formed open bag → folded flat; view state); the model animates towards it. */
  foldProgress: number;
  /**
   * Target assembly state 0..1 (flat sheet → formed open bag; view state). Default 1 = formed bag, so callers that
   * only fold (e.g. the offscreen snapshots) are unaffected. A fold progress > 0 implies a finished assembly.
   */
  assemblyProgress?: number;
};

function writeLineBuffer(line: LineRef | null, segments: number, write: (out: Float32Array) => void) {
  if (!line) return;
  const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute | undefined;
  if (!start || start.data.array.length !== segments * 6) return;
  write(start.data.array as Float32Array);
  start.data.needsUpdate = true;
}

function writeLine(line: LineRef | null, specs: Parameters<typeof writeLineSegments>[0], frame: BagFrame) {
  writeLineBuffer(line, specs.length, (out) => writeLineSegments(specs, frame, out));
}

function writeAssemblyLine(line: LineRef | null, specs: readonly AssemblyLineSpec[], frame: AssemblyFrame) {
  writeLineBuffer(line, specs.length, (out) => writeAssemblyLines(specs, frame, out));
}

/** Placeholder points so drei allocates line buffers of the right size; real positions are written in place. */
const placeholderPoints = (segments: number) =>
  Array.from({ length: segments * 2 }, (): [number, number, number] => [0, 0, 0]);

const clamp01 = (value: number, fallback: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

const PAPER_MATERIAL = { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 } as const;
// Push faces back in depth so edge/crease lines drawn on them never z-fight.
const POLYGON_OFFSET = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } as const;
const artworkProgramKey = () => ARTWORK_PROGRAM_KEY;

type SurfaceViewProps = {
  name: string;
  geometry: BufferGeometry;
  /** Identifies the surface for tests / picking (panel, piece). */
  userData: Record<string, unknown>;
  palette: PaperPalette;
  /** Artwork texture shown on the outer face, or null for plain paper. */
  texture: Texture | null;
};

/**
 * One wall, bottom or sheet piece: outer face (artwork or paper) + inner face (always plain paper, visible through
 * the open top).
 */
function SurfaceView({ name, geometry, userData, palette, texture }: SurfaceViewProps) {
  return (
    <group name={name}>
      <mesh geometry={geometry} userData={{ ...userData, side: 'outer' }}>
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
      <mesh geometry={geometry} userData={{ ...userData, side: 'inner' }}>
        <meshStandardMaterial color={palette.paper} side={BackSide} {...PAPER_MATERIAL} {...POLYGON_OFFSET} />
      </mesh>
    </group>
  );
}

/**
 * Artwork texture of one wall with its placement applied over the wall's artwork area (wall, or wall + bottom
 * allowance). One texture per wall, shared by the wall mesh and the bottom piece(s) formed from its allowance, so
 * the image continues across the bottom crease in one UV space.
 */
function useWallTexture(panel: BagPanel, dimensions: Dimensions): Texture | null {
  const artwork = panel.artwork;
  const texture = usePanelTexture(artwork?.fileUrl);
  usePanelUvTransform(
    texture,
    getPanelSize(panel.position, dimensions),
    artwork?.width ?? 0,
    artwork?.height ?? 0,
    panel.placement,
    getPanelArtworkArea(panel.position, dimensions, panel.placement),
  );
  return texture;
}

export function BagModel({ dimensions, paperColor, panels, handle, foldProgress, assemblyProgress = 1 }: BagModelProps) {
  const { width, height, depth } = dimensions;
  const dims = useMemo(() => ({ width, height, depth }), [width, height, depth]);
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.WHITE;

  const meshes = useMemo(() => createBagMeshes(dims), [dims]);
  const assemblyMeshes = useMemo(() => createAssemblyMeshes(dims), [dims]);
  const textures: Record<PanelPosition, Texture | null> = {
    FRONT: useWallTexture(panels.FRONT, dims),
    BACK: useWallTexture(panels.BACK, dims),
    LEFT: useWallTexture(panels.LEFT, dims),
    RIGHT: useWallTexture(panels.RIGHT, dims),
  };
  const textureOf = (mesh: PanelMesh) =>
    mesh.id !== 'BOTTOM' || panels[mesh.artworkPanel].placement.extendToBottom ? textures[mesh.artworkPanel] : null;
  // Sheet pieces: walls always show their artwork; allowance pieces only when the wall extends to the bottom.
  const assemblyTextureOf = (mesh: AssemblyMesh) =>
    mesh.artworkPanel && (!mesh.piece.allowance || panels[mesh.artworkPanel].placement.extendToBottom)
      ? textures[mesh.artworkPanel]
      : null;
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  useEffect(() => () => assemblyMeshes.forEach((m) => m.geometry.dispose()), [assemblyMeshes]);

  const edgeSpecs = useMemo(() => getEdgeSpecs(dims), [dims]);
  const creaseSpecs = useMemo(() => getCreaseSpecs(dims), [dims]);
  const edgePoints = useMemo(() => placeholderPoints(edgeSpecs.length), [edgeSpecs]);
  const creasePoints = useMemo(() => placeholderPoints(creaseSpecs.length), [creaseSpecs]);
  const assemblyLines = useMemo(() => getAssemblyLineSpecs(dims), [dims]);
  const sheetCutPoints = useMemo(() => placeholderPoints(assemblyLines.cut.length), [assemblyLines]);
  const sheetCreasePoints = useMemo(() => placeholderPoints(assemblyLines.crease.length), [assemblyLines]);

  const edgesRef = useRef<LineRef>(null);
  const creasesRef = useRef<LineRef>(null);
  const sheetCutRef = useRef<LineRef>(null);
  const sheetCreaseRef = useRef<LineRef>(null);
  const foldGroup = useRef<Group>(null);
  const assemblyGroup = useRef<Group>(null);
  const targetTimeline = toPreviewTimeline(clamp01(assemblyProgress, 1), clamp01(foldProgress, 0));
  /** Currently displayed (animated) timeline value. Starts at the target: no animation on first mount. */
  const current = useRef(targetTimeline);

  const handleGroups = useRef<HandleWallGroups>({ FRONT: null, BACK: null });

  const pose = useCallback(
    (timeline: number) => {
      const { assemblyProgress: q, foldProgress: p } = splitPreviewTimeline(timeline);
      const assembling = q < 1;
      if (foldGroup.current) foldGroup.current.visible = !assembling;
      if (assemblyGroup.current) assemblyGroup.current.visible = assembling;
      if (assembling) {
        const frame = getAssemblyFrame(dims, q);
        for (const mesh of assemblyMeshes) updateAssemblyMesh(mesh, frame);
        writeAssemblyLine(sheetCutRef.current, assemblyLines.cut, frame);
        writeAssemblyLine(sheetCreaseRef.current, assemblyLines.crease, frame);
        for (const wall of HANDLE_WALLS) {
          const group = handleGroups.current[wall];
          if (!group) continue;
          group.matrix.set(...(getAssemblyHandleMatrix(frame, wall) as Parameters<typeof group.matrix.set>));
          group.matrix.decompose(group.position, group.quaternion, group.scale);
        }
        return;
      }
      const frame = getBagFrame(dims, p);
      for (const mesh of meshes) updatePanelMesh(mesh, frame);
      writeLine(edgesRef.current, edgeSpecs, frame);
      writeLine(creasesRef.current, creaseSpecs, frame);
      for (const wall of HANDLE_WALLS) {
        const group = handleGroups.current[wall];
        if (!group) continue;
        const { stackThickness = 0, halfExtent = 0 } = group.userData;
        const { z, rotationY, squash } = getHandleWallPose(frame, wall, stackThickness, halfExtent);
        group.position.set(0, 0, z);
        group.rotation.set(0, rotationY, 0);
        group.scale.set(1, 1, squash);
      }
    },
    [dims, meshes, assemblyMeshes, edgeSpecs, creaseSpecs, assemblyLines],
  );

  // New geometry (dimension change), new line buffers or (re)mounted handles → pose them before the browser paints.
  useLayoutEffect(() => {
    pose(current.current);
  }, [pose, edgePoints, creasePoints, sheetCutPoints, sheetCreasePoints, handle]);

  useFrame((_, delta) => {
    const diff = targetTimeline - current.current;
    if (diff === 0) return;
    const next =
      Math.abs(diff) < FOLD_EPSILON ? targetTimeline : current.current + diff * (1 - Math.exp(-FOLD_DAMPING * delta));
    current.current = next;
    pose(next);
  });

  return (
    <group name="bag">
      <group ref={foldGroup} name="bag-folded">
        {meshes.map((mesh) => (
          <SurfaceView
            key={mesh.piece ?? mesh.id}
            name={`panel-${mesh.piece ? `${mesh.id}-${mesh.piece}` : mesh.id}`}
            geometry={mesh.geometry}
            userData={{ panel: mesh.id, piece: mesh.piece }}
            palette={palette}
            texture={textureOf(mesh)}
          />
        ))}
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

      <group ref={assemblyGroup} name="bag-sheet">
        {assemblyMeshes.map((mesh) => (
          <SurfaceView
            key={mesh.piece.id}
            name={`sheet-${mesh.piece.id}`}
            geometry={mesh.geometry}
            userData={{ panel: mesh.piece.panel, piece: mesh.piece.id }}
            palette={palette}
            texture={assemblyTextureOf(mesh)}
          />
        ))}
        <Line ref={sheetCutRef} segments points={sheetCutPoints} color={palette.edge} lineWidth={1} frustumCulled={false} />
        <Line
          ref={sheetCreaseRef}
          segments
          points={sheetCreasePoints}
          color={palette.crease}
          lineWidth={1}
          transparent
          opacity={0.7}
          frustumCulled={false}
        />
      </group>

      {handle && <HandleModel handle={handle} dimensions={dims} paperColor={getHandlePaperColor({ color: paperColor })} wallGroups={handleGroups} />}
    </group>
  );
}
