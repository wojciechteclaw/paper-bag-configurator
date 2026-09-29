import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { BackSide, FrontSide, type InterleavedBufferAttribute } from 'three';
import type { Dimensions, PaperColor } from '../domain/types';
import {
  createPanelMesh,
  getBagFrame,
  getCreaseSpecs,
  getEdgeSpecs,
  updatePanelMesh,
  writeLineSegments,
  BAG_PANEL_IDS,
  type BagFrame,
} from './bagGeometry';
import { PAPER_PALETTES } from './constants';

// Procedural block-bottom bag body. Face mapping (see bagGeometry.ts):
//   FRONT → +Z, BACK → −Z, LEFT → −X, RIGHT → +X, BOTTOM → −Y; the top is open (no top face, no turn-in).
// Each panel is its own mesh with its own outer material, so per-panel artwork can be attached later
// (UVs are already laid out per panel, continuous across the side regions L, R, T).
// TODO(3d-renderer): HandleModel (TWISTED_PAPER / FLAT_PAPER + inner patches) attached to FRONT/BACK.

/** Exponential damping rate of the fold animation (1/s). Higher = snappier. */
const FOLD_DAMPING = 6;
const FOLD_EPSILON = 1e-4;

type LineRef = ComponentRef<typeof Line>;

type BagModelProps = {
  dimensions: Dimensions;
  paperColor: PaperColor;
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

export function BagModel({ dimensions, paperColor, foldProgress }: BagModelProps) {
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

  const pose = useCallback(
    (progress: number) => {
      const frame = getBagFrame(dims, progress);
      for (const mesh of meshes) updatePanelMesh(mesh, frame);
      writeLine(edgesRef.current, edgeSpecs, frame);
      writeLine(creasesRef.current, creaseSpecs, frame);
    },
    [dims, meshes, edgeSpecs, creaseSpecs],
  );

  // New geometry (dimension change) or new line buffers → pose them before the browser paints.
  useLayoutEffect(() => {
    pose(current.current);
  }, [pose, edgePoints, creasePoints]);

  useFrame((_, delta) => {
    const target = Math.min(1, Math.max(0, Number.isFinite(foldProgress) ? foldProgress : 0));
    const diff = target - current.current;
    if (diff === 0) return;
    const next =
      Math.abs(diff) < FOLD_EPSILON ? target : current.current + diff * (1 - Math.exp(-FOLD_DAMPING * delta));
    current.current = next;
    pose(next);
  });

  const paperMaterial = { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 } as const;

  return (
    <group name="bag">
      {meshes.map((mesh) => (
        <group key={mesh.id} name={`panel-${mesh.id}`}>
          {/* Outer face — future per-panel artwork goes on this material. */}
          <mesh geometry={mesh.geometry} userData={{ panel: mesh.id, side: 'outer' }}>
            <meshStandardMaterial
              color={palette.paper}
              side={FrontSide}
              {...paperMaterial}
              // Push faces back in depth so edge/crease lines drawn on them never z-fight.
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          </mesh>
          {/* Inner face (visible through the open top): plain paper, never artwork. */}
          <mesh geometry={mesh.geometry} userData={{ panel: mesh.id, side: 'inner' }}>
            <meshStandardMaterial
              color={palette.paper}
              side={BackSide}
              {...paperMaterial}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          </mesh>
        </group>
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
  );
}
