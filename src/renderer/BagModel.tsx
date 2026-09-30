import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, FrontSide, type BufferGeometry, type Group, type InterleavedBufferAttribute, type Texture } from 'three';
import { planArtworkComposite } from '../domain/artworkComposite';
import { getHandlePaperColor } from '../domain/geometry/handles';
import type { ResolvedPanelArtwork, ResolvedPanelArtworks } from '../domain/artworkLayout';
import { splitPreviewTimeline, toPreviewTimeline } from '../domain/geometry/assemblyKinematics';
import { getPanelSize } from '../domain/panels';
import type { ArtworkPlacement, Dimensions, Handle, PanelPosition, PaperColor } from '../domain/types';
import {
  createAssemblyMeshes,
  getAssemblyFrame,
  getAssemblyHandleMatrix,
  getAssemblyDebugEdges,
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
  getInnerBottomEdgeSpecs,
  updatePanelMesh,
  writeLineSegments,
  type BagFrame,
  type MeshFace,
  type PanelMesh,
} from './bagGeometry';
import { COMPOSITE_MAX_SIDE_PX, PAPER_PALETTES, type PaperPalette } from './constants';
import { getHandleWallPose, HANDLE_WALLS } from './handleGeometry';
import { HandleModel, type HandleWallGroups } from './HandleModel';
import {
  ARTWORK_PROGRAM_KEY,
  clipArtworkToImage,
  useArtworkTextures,
  useCompositeTexture,
  usePanelUvTransform,
  useTextureView,
  type ArtworkTextures,
} from './panelTexture';

// Procedural block-bottom bag body. Face mapping (see bagGeometry.ts):
//   FRONT → +Z, BACK → −Z, LEFT → −X, RIGHT → +X, BOTTOM → −Y; the top is open (no top face, no turn-in).
// Each panel is its own mesh with its own outer material, so every PanelPosition maps to exactly one artwork
// texture (UVs continuous across the fold regions of the panel). The bottom is one mesh per visible piece (BACK
// trapezoid — outermost, client rule —, the free part of the FRONT trapezoid, the two side triangles) in the UV space of
// the wall it is folded from, each offset outwards per layer (BOTTOM_LAYER_OFFSET_MM): it
// shows that wall's texture (same object, same transform) only when the wall's placement extends to the bottom
// (SPEC §4f), otherwise plain paper. Those pieces render their outer face only; the inside of the bottom (seen through
// the open top) is a second set of plain-paper meshes — side flaps, glue flap strip, trapezoids between the flaps —
// with their paper edges (createInnerBottomMeshes / getInnerBottomEdgeSpecs).
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
  /**
   * What every wall shows — its artwork layers (bottom → top), each with placement and artwork area
   * (`resolvePanelArtworks(configuration)`): per-wall artwork or the whole-bag layers (docs/SPEC.md §3a, §3b).
   */
  artworks: ResolvedPanelArtworks;
  /** Internal handle (FRONT + BACK) or null. */
  handle: Handle | null;
  /** Target fold state 0..1 (formed open bag → folded flat; view state); the model animates towards it. */
  foldProgress: number;
  /**
   * Target assembly state 0..1 (flat sheet → formed open bag; view state). Default 1 = formed bag, so callers that
   * only fold (e.g. the offscreen snapshots) are unaffected. A fold progress > 0 implies a finished assembly.
   */
  assemblyProgress?: number;
  /** Debug aid: numbered, highlighted edges of the bottom-zone pieces during the assembly (`?lines`). */
  debugLines?: boolean;
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
// Push faces back in depth so edge/crease lines drawn on them never z-fight. Constant bias only (~0.01 mm at the
// default camera distance): a slope-scaled factor pushed oblique faces back by ~1 mm, more than the 0.05–0.2 mm
// paper-layer gaps, so lines and patches of hidden layers showed through the layer covering them.
const POLYGON_OFFSET = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 } as const;
const DEBUG_LABEL_STYLE = {
  background: '#e0115f',
  color: '#fff',
  font: '600 11px/1 sans-serif',
  padding: '2px 4px',
  borderRadius: 3,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
} as const;
const artworkProgramKey = () => ARTWORK_PROGRAM_KEY;

type SurfaceViewProps = {
  name: string;
  geometry: BufferGeometry;
  /** Identifies the surface for tests / picking (panel, piece). */
  userData: Record<string, unknown>;
  palette: PaperPalette;
  /** Artwork texture shown on the outer face, or null for plain paper. */
  texture: Texture | null;
  /** Faces to render (default both; the formed bottom splits them into two tilings, see bagGeometry.ts). */
  faces?: MeshFace;
};

/**
 * One wall, bottom or sheet piece: outer face (artwork or paper) + inner face (always plain paper, visible through
 * the open top).
 */
function SurfaceView({ name, geometry, userData, palette, texture, faces = 'both' }: SurfaceViewProps) {
  return (
    <group name={name}>
      <mesh geometry={geometry} userData={{ ...userData, side: 'outer' }} visible={faces !== 'inner'}>
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
      <mesh geometry={geometry} userData={{ ...userData, side: 'inner' }} visible={faces !== 'outer'}>
        <meshStandardMaterial color={palette.paper} side={BackSide} {...PAPER_MATERIAL} {...POLYGON_OFFSET} />
      </mesh>
    </group>
  );
}

/** A composite is mapped like one image stretched over its frame (the frame is passed as the artwork area). */
const COMPOSITE_PLACEMENT: ArtworkPlacement = { mode: 'FILL', extendToBottom: false };

/**
 * Artwork texture of one wall with its placement applied over the wall's artwork area (wall, or wall + bottom
 * allowance; for a whole-bag layer the wrap area expressed in this wall's coordinates). One texture per wall, shared
 * by the wall mesh and the bottom piece(s) formed from its allowance, so the image continues across the bottom crease
 * in one UV space. One layer: a view of the shared image texture with its own transform. Several layers (docs/SPEC.md
 * §3b): one canvas composite of all layers over the wall's composite frame (`planArtworkComposite`), mapped FILL over
 * that frame — no stacked meshes, so no z-fighting, and bottom / sheet pieces work unchanged.
 */
function useWallTexture(
  resolved: ResolvedPanelArtwork,
  dimensions: Dimensions,
  textures: ArtworkTextures,
  maxCompositeSidePx: number,
): Texture | null {
  const { layers, position } = resolved;
  const { width: pw, height: ph } = getPanelSize(position, dimensions);
  const single = layers.length === 1 ? layers[0] : null;
  const view = useTextureView(single ? (textures.get(single.artwork.fileUrl) ?? null) : null);
  const plan = useMemo(
    () =>
      layers.length > 1
        ? planArtworkComposite({ width: pw, height: ph }, layers, { maxLongSidePx: maxCompositeSidePx })
        : null,
    [layers, pw, ph, maxCompositeSidePx],
  );
  const composite = useCompositeTexture(plan, textures);
  const texture = single ? view : composite;
  usePanelUvTransform(
    texture,
    { width: pw, height: ph },
    single ? single.artwork.width : (plan?.width ?? 0),
    single ? single.artwork.height : (plan?.height ?? 0),
    single ? single.placement : COMPOSITE_PLACEMENT,
    single ? single.area : plan?.frame,
  );
  return texture;
}

export function BagModel({
  dimensions,
  paperColor,
  artworks,
  handle,
  foldProgress,
  assemblyProgress = 1,
  debugLines = false,
}: BagModelProps) {
  const { width, height, depth } = dimensions;
  const dims = useMemo(() => ({ width, height, depth }), [width, height, depth]);
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.WHITE;

  const meshes = useMemo(() => createBagMeshes(dims), [dims]);
  const assemblyMeshes = useMemo(() => createAssemblyMeshes(dims), [dims]);
  // Every distinct image is loaded once for the whole bag (a whole-bag layer is shown by all four walls).
  const urls = useMemo(
    () => Object.values(artworks).flatMap((panel) => panel.layers.map((layer) => layer.artwork.fileUrl)),
    [artworks],
  );
  const loaded = useArtworkTextures(urls);
  const maxTextureSize = useThree((s) => s.gl.capabilities.maxTextureSize);
  const maxCompositeSidePx = Math.min(COMPOSITE_MAX_SIDE_PX, maxTextureSize || COMPOSITE_MAX_SIDE_PX);
  const textures: Record<PanelPosition, Texture | null> = {
    FRONT: useWallTexture(artworks.FRONT, dims, loaded, maxCompositeSidePx),
    BACK: useWallTexture(artworks.BACK, dims, loaded, maxCompositeSidePx),
    LEFT: useWallTexture(artworks.LEFT, dims, loaded, maxCompositeSidePx),
    RIGHT: useWallTexture(artworks.RIGHT, dims, loaded, maxCompositeSidePx),
  };
  const textureOf = (mesh: PanelMesh) =>
    mesh.id !== 'BOTTOM' || artworks[mesh.artworkPanel].extendsToBottom ? textures[mesh.artworkPanel] : null;
  // Sheet pieces: walls always show their artwork; allowance pieces only when the wall extends to the bottom.
  const assemblyTextureOf = (mesh: AssemblyMesh) =>
    mesh.artworkPanel && (!mesh.piece.allowance || artworks[mesh.artworkPanel].extendsToBottom)
      ? textures[mesh.artworkPanel]
      : null;
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  useEffect(() => () => assemblyMeshes.forEach((m) => m.geometry.dispose()), [assemblyMeshes]);

  // Panel boundaries + the paper edges on the inside of the bottom (seen through the open top only).
  const edgeSpecs = useMemo(() => [...getEdgeSpecs(dims), ...getInnerBottomEdgeSpecs(dims)], [dims]);
  const creaseSpecs = useMemo(() => getCreaseSpecs(dims), [dims]);
  const edgePoints = useMemo(() => placeholderPoints(edgeSpecs.length), [edgeSpecs]);
  const creasePoints = useMemo(() => placeholderPoints(creaseSpecs.length), [creaseSpecs]);
  const assemblyLines = useMemo(() => getAssemblyLineSpecs(dims), [dims]);
  const sheetCutPoints = useMemo(() => placeholderPoints(assemblyLines.cut.length), [assemblyLines]);
  const sheetCreasePoints = useMemo(() => placeholderPoints(assemblyLines.crease.length), [assemblyLines]);
  const debugEdges = useMemo(() => (debugLines ? getAssemblyDebugEdges(dims) : []), [debugLines, dims]);
  const debugPoints = useMemo(() => placeholderPoints(debugEdges.length), [debugEdges]);
  const debugRef = useRef<LineRef>(null);
  const debugLabels = useRef<(Group | null)[]>([]);
  const debugLabelElements = useRef<(HTMLDivElement | null)[]>([]);

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
      // Html labels are DOM overlays: they ignore the hidden group, so toggle them explicitly.
      for (const element of debugLabelElements.current) if (element) element.style.display = assembling ? '' : 'none';
      if (assembling) {
        const frame = getAssemblyFrame(dims, q);
        for (const mesh of assemblyMeshes) updateAssemblyMesh(mesh, frame);
        writeAssemblyLine(sheetCutRef.current, assemblyLines.cut, frame);
        writeAssemblyLine(sheetCreaseRef.current, assemblyLines.crease, frame);
        if (debugEdges.length > 0) {
          writeAssemblyLine(debugRef.current, debugEdges, frame);
          const out = new Float32Array(debugEdges.length * 6);
          writeAssemblyLines(debugEdges, frame, out);
          debugLabels.current.forEach((label, i) => {
            const o = i * 6;
            label?.position.set((out[o] + out[o + 3]) / 2, (out[o + 1] + out[o + 4]) / 2, (out[o + 2] + out[o + 5]) / 2);
          });
        }
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
    [dims, meshes, assemblyMeshes, edgeSpecs, creaseSpecs, assemblyLines, debugEdges],
  );

  // New geometry (dimension change), new line buffers or (re)mounted handles → pose them before the browser paints.
  useLayoutEffect(() => {
    pose(current.current);
  }, [pose, edgePoints, creasePoints, sheetCutPoints, sheetCreasePoints, debugPoints, handle]);

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
            key={`${mesh.face}-${mesh.piece ?? mesh.id}`}
            name={`panel-${mesh.piece ? `${mesh.id}-${mesh.face === 'inner' ? 'inner-' : ''}${mesh.piece}` : mesh.id}`}
            geometry={mesh.geometry}
            userData={{ panel: mesh.id, piece: mesh.piece }}
            palette={palette}
            texture={mesh.face === 'inner' ? null : textureOf(mesh)}
            faces={mesh.face}
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
        {debugEdges.length > 0 && (
          <>
            <Line ref={debugRef} segments points={debugPoints} color="#e0115f" lineWidth={2} frustumCulled={false} />
            {debugEdges.map((_, k) => (
              <group
                key={k}
                ref={(g) => {
                  debugLabels.current[k] = g;
                }}
              >
                <Html
                  ref={(element) => {
                    debugLabelElements.current[k] = element;
                  }}
                  center
                  occlude
                  zIndexRange={[20, 0]}
                  style={DEBUG_LABEL_STYLE}
                >
                  {k + 1}
                </Html>
              </group>
            ))}
          </>
        )}
      </group>

      {handle && <HandleModel handle={handle} dimensions={dims} paperColor={getHandlePaperColor({ color: paperColor })} wallGroups={handleGroups} />}
    </group>
  );
}
