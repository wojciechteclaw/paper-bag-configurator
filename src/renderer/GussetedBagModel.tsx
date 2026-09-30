import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, CanvasTexture, DoubleSide, FrontSide, RepeatWrapping, SRGBColorSpace, type InterleavedBufferAttribute } from 'three';
import type { ResolvedPanelArtworks } from '../domain/artworkLayout';
import { BAG_TYPES, GUSSETED_BAG_RULES } from '../domain/config/productCatalog';
import { toGussetedTimeline } from '../domain/geometry/gussetedAssembly';
import type { BagWindow, Dimensions, PaperColor } from '../domain/types';
import { useBagWallTextures } from './wallTextures';
import { PAPER_PALETTES, WINDOW_FILM_LOOKS } from './constants';
import {
  createGussetedMeshes,
  getFrontOpening,
  getGussetedFrame,
  getGussetedLineSpecs,
  updateGussetedMesh,
  writeGussetedLines,
  type GussetedFrame,
  type GussetedLineSpec,
  type GussetedMesh,
} from './gussetedBagGeometry';
import { ARTWORK_PROGRAM_KEY, clipArtworkToImage } from './panelTexture';

// Procedural gusseted bag with a fold-over bottom (FOLDED, docs/SPEC.md §4i, docs/PRODUCTION.md §13.6). A pure view of
// the configuration like BagModel, but its own model and timeline: the printed sheet forms into the flat bag as on the
// machine (gussets tucked, BACK wrapped with the seam, bottom strip folded to the back) and the bag then opens to the
// mouth W × F. `assemblyProgress` (production) and `foldProgress` (1 = flat, 0 = open) are combined into ONE gusseted
// timeline value (`toGussetedTimeline`) that is damped towards its target, so presets animate through every phase.
// One mesh per rigid facet; walls show their artwork (per wall or whole-bag layers via the shared wall textures), the
// bottom strip only when the wall prints its bottom allowance ("extend to bottom", whole-sheet artwork), the seam flap
// is plain paper. No handles. A window (docs/SPEC.md §2b) is a
// hole in FRONT closed by a transparent, slightly tinted film glued on the inside (overlapping the paper), posed with
// FRONT through every phase; perforated PP adds a faint dot pattern.

const DAMPING = 6;
const EPSILON = 1e-4;
const PAPER_MATERIAL = { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 } as const;
// Same constant depth bias as BagModel: crease / edge lines drawn on the faces never z-fight.
const POLYGON_OFFSET = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 } as const;
const artworkProgramKey = () => ARTWORK_PROGRAM_KEY;

type LineRef = ComponentRef<typeof Line>;

export type GussetedBagModelProps = {
  dimensions: Dimensions;
  /** Bottom strip d, mm (default: GUSSETED_BAG_RULES.bottomFoldDepth). */
  bottomFoldDepth?: number;
  /** Seam overlap s, mm (default: the gusseted bag's catalog default). */
  glueFlapWidth?: number;
  paperColor: PaperColor;
  /** What every wall shows (`resolvePanelArtworks(configuration)`). */
  artworks: ResolvedPanelArtworks;
  /** Target opening state (view state): 1 = folded flat, 0 = fully open; the model animates towards it. */
  foldProgress: number;
  /** Target production state 0..1 (sheet → finished flat bag; view state). Default 1 = produced. */
  assemblyProgress?: number;
  /** Film window in FRONT, or null / omitted. */
  window?: BagWindow | null;
};

/** Small tileable dot texture of the perforated film (colour map: light background, faint grey dots). */
function createPerforationTexture(repeatX: number, repeatY: number): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#8f9aa3';
  ctx.beginPath();
  ctx.arc(16, 16, 3.5, 0, Math.PI * 2);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  return texture;
}

function writeLines(line: LineRef | null, specs: readonly GussetedLineSpec[], frame: GussetedFrame) {
  if (!line) return;
  const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute | undefined;
  if (!start || start.data.array.length !== specs.length * 6) return;
  writeGussetedLines(specs, frame, start.data.array as Float32Array);
  start.data.needsUpdate = true;
}

const placeholderPoints = (segments: number) =>
  Array.from({ length: segments * 2 }, (): [number, number, number] => [0, 0, 0]);

const DEFAULT_GLUE_FLAP = BAG_TYPES.FOLDED.glueFlap.default;

export function GussetedBagModel({
  dimensions,
  bottomFoldDepth,
  glueFlapWidth = DEFAULT_GLUE_FLAP,
  paperColor,
  artworks,
  foldProgress,
  assemblyProgress = 1,
  window: bagWindow = null,
}: GussetedBagModelProps) {
  const { width, height, depth } = dimensions;
  const dims = useMemo(
    () => ({ width, height, depth, bottomFold: bottomFoldDepth ?? GUSSETED_BAG_RULES.bottomFoldDepth }),
    [width, height, depth, bottomFoldDepth],
  );
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.WHITE;

  const meshes = useMemo(() => createGussetedMeshes(dims, glueFlapWidth, bagWindow), [dims, glueFlapWidth, bagWindow]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  const lines = useMemo(() => getGussetedLineSpecs(dims, glueFlapWidth, bagWindow), [dims, glueFlapWidth, bagWindow]);
  const filmLook = bagWindow ? WINDOW_FILM_LOOKS[bagWindow.material] : null;
  const perforation = useMemo(() => {
    const opening = getFrontOpening(dims, bagWindow);
    const pitch = filmLook?.perforationPitchMm ?? 0;
    return opening && pitch > 0 ? createPerforationTexture(opening.width / pitch, opening.height / pitch) : null;
  }, [dims, bagWindow, filmLook]);
  useEffect(() => () => perforation?.dispose(), [perforation]);
  const edgePoints = useMemo(() => placeholderPoints(lines.edges.length), [lines]);
  const creasePoints = useMemo(() => placeholderPoints(lines.creases.length), [lines]);
  const edgesRef = useRef<LineRef>(null);
  const creasesRef = useRef<LineRef>(null);

  // Same wall textures as the block-bottom model: one layer = a view of the image, several = a canvas composite.
  const textures = useBagWallTextures(artworks, dims);
  const textureOf = (mesh: GussetedMesh) =>
    mesh.artworkPanel && (!mesh.piece.strip || artworks[mesh.artworkPanel].extendsToBottom) ? textures[mesh.artworkPanel] : null;

  const clamp01 = (value: number, fallback: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);
  const target = toGussetedTimeline(clamp01(assemblyProgress, 1), clamp01(foldProgress, 0));
  /** Displayed (animated) timeline value; starts at the target, so the first mount does not animate. */
  const current = useRef(target);

  const pose = useCallback(
    (timeline: number) => {
      const frame = getGussetedFrame(dims, glueFlapWidth, timeline);
      for (const mesh of meshes) updateGussetedMesh(mesh, frame);
      writeLines(edgesRef.current, lines.edges, frame);
      writeLines(creasesRef.current, lines.creases, frame);
    },
    [dims, glueFlapWidth, meshes, lines],
  );

  useLayoutEffect(() => {
    pose(current.current);
  }, [pose, edgePoints, creasePoints]);

  useFrame((_, delta) => {
    const diff = target - current.current;
    if (diff === 0) return;
    current.current = Math.abs(diff) < EPSILON ? target : current.current + diff * (1 - Math.exp(-DAMPING * delta));
    pose(current.current);
  });

  return (
    <group name="gusseted-bag">
      {meshes.map((mesh) => {
        if (mesh.film) {
          return filmLook ? (
            <mesh
              key={`film-${mesh.piece.id}`}
              name="window-film"
              geometry={mesh.geometry}
              renderOrder={2}
              userData={{ panel: 'FRONT', piece: mesh.piece.id, film: true }}
            >
              <meshStandardMaterial
                key={perforation ? perforation.uuid : 'film'}
                color={filmLook.color}
                map={perforation}
                transparent
                opacity={filmLook.opacity}
                roughness={filmLook.roughness}
                metalness={0}
                envMapIntensity={filmLook.envMapIntensity}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ) : null;
        }
        const texture = textureOf(mesh);
        const userData = { panel: mesh.artworkPanel, piece: mesh.piece.id, strip: mesh.piece.strip };
        return (
          <group key={mesh.piece.id} name={`piece-${mesh.piece.id}`}>
            <mesh geometry={mesh.geometry} userData={{ ...userData, side: 'outer' }}>
              {texture ? (
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
            <mesh geometry={mesh.geometry} userData={{ ...userData, side: 'inner' }}>
              <meshStandardMaterial color={palette.paper} side={BackSide} {...PAPER_MATERIAL} {...POLYGON_OFFSET} />
            </mesh>
          </group>
        );
      })}
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
