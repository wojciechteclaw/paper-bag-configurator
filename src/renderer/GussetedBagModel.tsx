import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, CanvasTexture, DoubleSide, FrontSide, RepeatWrapping, SRGBColorSpace, type InterleavedBufferAttribute } from 'three';
import type { ResolvedPanelArtworks } from '../domain/artworkLayout';
import type { BagWindow, Dimensions, PaperColor } from '../domain/types';
import { useBagWallTextures } from './wallTextures';
import { PAPER_PALETTES, WINDOW_FILM_LOOKS } from './constants';
import {
  countSegments,
  createGussetedMeshes,
  getFrontOpening,
  getGussetedFrame,
  getGussetedLineSpecs,
  updateGussetedMesh,
  writeGussetedLines,
  type GussetedFrame,
  type GussetedLineSpec,
} from './gussetedBagGeometry';
import { ARTWORK_PROGRAM_KEY, clipArtworkToImage } from './panelTexture';

// Procedural gusseted-bag bag with a fold-over bottom (FOLDED, docs/SPEC.md §4i, docs/PRODUCTION.md §13). A pure view of
// the configuration like BagModel, but a separate model: open (mouth W × D, narrowing to the glued bottom line) ↔
// folded flat, driven by the same view-only `foldProgress` (0 = open, 1 = flat) and animated towards it. There is no
// assembly from the sheet and no handle. Walls show their artwork (per wall or the whole-bag wrap, through the shared
// `computePanelUvTransform`); the folded bottom strip is plain paper. A window (docs/SPEC.md §2b) is a hole in FRONT
// (artwork masked, the interior — gusset and BACK inner faces — visible) closed by a transparent, slightly tinted,
// glossy film mesh in FRONT's surface; perforated PP adds a faint dot pattern.

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
  paperColor: PaperColor;
  /** What every wall shows (`resolvePanelArtworks(configuration)`). */
  artworks: ResolvedPanelArtworks;
  /** Target state 0..1 (open → folded flat; view state); the model animates towards it. */
  foldProgress: number;
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
  if (!start || start.data.array.length !== countSegments(specs) * 6) return;
  writeGussetedLines(specs, frame, start.data.array as Float32Array);
  start.data.needsUpdate = true;
}

const placeholderPoints = (segments: number) =>
  Array.from({ length: segments * 2 }, (): [number, number, number] => [0, 0, 0]);

export function GussetedBagModel({
  dimensions,
  bottomFoldDepth,
  paperColor,
  artworks,
  foldProgress,
  window: bagWindow = null,
}: GussetedBagModelProps) {
  const { width, height, depth } = dimensions;
  const dims = useMemo(() => ({ width, height, depth, bottomFold: bottomFoldDepth }), [width, height, depth, bottomFoldDepth]);
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.WHITE;

  const meshes = useMemo(() => createGussetedMeshes(dims, bagWindow), [dims, bagWindow]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  const lines = useMemo(() => getGussetedLineSpecs(dims, bagWindow), [dims, bagWindow]);
  const filmLook = bagWindow ? WINDOW_FILM_LOOKS[bagWindow.material] : null;
  const perforation = useMemo(() => {
    const opening = getFrontOpening(dims, bagWindow);
    const pitch = filmLook?.perforationPitchMm ?? 0;
    return opening && pitch > 0 ? createPerforationTexture(opening.width / pitch, opening.height / pitch) : null;
  }, [dims, bagWindow, filmLook]);
  useEffect(() => () => perforation?.dispose(), [perforation]);
  const edgePoints = useMemo(() => placeholderPoints(countSegments(lines.edges)), [lines]);
  const creasePoints = useMemo(() => placeholderPoints(countSegments(lines.creases)), [lines]);
  const edgesRef = useRef<LineRef>(null);
  const creasesRef = useRef<LineRef>(null);

  // Same wall textures as the block-bottom model: one layer = a view of the image, several = a canvas composite.
  const textures = useBagWallTextures(artworks, dims);

  const target = Number.isFinite(foldProgress) ? Math.min(1, Math.max(0, foldProgress)) : 0;
  /** Displayed (animated) fold value; starts at the target, so the first mount does not animate. */
  const current = useRef(target);

  const pose = useCallback(
    (fold: number) => {
      const frame = getGussetedFrame(dims, fold);
      for (const mesh of meshes) updateGussetedMesh(mesh, frame);
      writeLines(edgesRef.current, lines.edges, frame);
      writeLines(creasesRef.current, lines.creases, frame);
    },
    [dims, meshes, lines],
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
            <mesh key={mesh.id} name="window-film" geometry={mesh.geometry} renderOrder={2} userData={{ panel: mesh.panel, film: true }}>
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
        const texture = mesh.strip ? null : textures[mesh.panel];
        return (
          <group key={mesh.id} name={`panel-${mesh.id}`}>
            <mesh geometry={mesh.geometry} userData={{ panel: mesh.panel, strip: mesh.strip, side: 'outer' }}>
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
            <mesh geometry={mesh.geometry} userData={{ panel: mesh.panel, strip: mesh.strip, side: 'inner' }}>
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
