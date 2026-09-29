import { Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { Color, DoubleSide, type BufferGeometry, type Group } from 'three';
import { getHandleLayout } from '../domain/geometry/handles';
import type { Dimensions, Handle, PaperColor } from '../domain/types';
import { PAPER_PALETTES } from './constants';
import {
  createPatchGeometry,
  createPatchOutlinePoints,
  createPatchShadowGeometry,
  createRopeGeometry,
  createStripGeometry,
  createTwistTexture,
  HANDLE_POLYGON_OFFSET,
  HANDLE_WALLS,
  PATCH_SHADOW,
  PATCH_TONE,
  handleHalfExtent,
  handleStackThickness,
  twistRepeat,
  type HandleWall,
} from './handleGeometry';

// Internal handles (docs/PRODUCTION.md §5): one loop + one reinforcement patch on the inside of FRONT and of BACK.
// Geometry lives in a handle-local frame (see handleGeometry.ts); BagModel poses the two wall groups every fold frame
// through `wallGroups` (group transform only — no per-frame geometry work).

export type HandleWallGroups = Record<HandleWall, Group | null>;

type HandleModelProps = {
  handle: Handle;
  dimensions: Dimensions;
  /** Handle and patch paper colour — follows the bag paper (`getHandlePaperColor`). */
  paperColor: PaperColor;
  /** Filled with the two wall groups; BagModel writes their transforms (userData.stackThickness / halfExtent in mm). */
  wallGroups: { current: HandleWallGroups };
};

// Same polygon offset as the bag panels, so the 1 mm wall clearance (not the panels' depth bias) decides visibility:
// the handle and patch never show through FRONT / BACK / the gussets from outside.
const HANDLE_MATERIAL = { roughness: 0.9, metalness: 0, envMapIntensity: 0.35, ...HANDLE_POLYGON_OFFSET } as const;

export function HandleModel({ handle, dimensions, paperColor, wallGroups }: HandleModelProps) {
  const { type, width: handleWidth, length, color, patch } = handle;
  const { width, height, depth } = dimensions;
  const patchW = patch?.width;
  const patchH = patch?.height;

  // Memoised on the handle parameters that shape the geometry + the dimensions (not on object identity).
  const layout = useMemo(
    () =>
      getHandleLayout(
        {
          id: '',
          type,
          material: 'KRAFT',
          width: handleWidth,
          length,
          color,
          patch: patchW !== undefined && patchH !== undefined ? { width: patchW, height: patchH } : undefined,
        },
        { width, height, depth },
      ),
    [type, handleWidth, length, color, patchW, patchH, width, height, depth],
  );

  const built = useMemo(() => {
    const patchGeometry = createPatchGeometry(layout);
    const shadowGeometry = createPatchShadowGeometry(layout);
    const outline = createPatchOutlinePoints(layout);
    if (layout.params.type === 'TWISTED_PAPER') {
      const rope = createRopeGeometry(layout);
      return { patchGeometry, shadowGeometry, outline, handleGeometry: rope.geometry as BufferGeometry, ropeLength: rope.length };
    }
    return { patchGeometry, shadowGeometry, outline, handleGeometry: createStripGeometry(layout), ropeLength: 0 };
  }, [layout]);
  useEffect(
    () => () => {
      built.patchGeometry.dispose();
      built.shadowGeometry.dispose();
      built.handleGeometry.dispose();
    },
    [built],
  );

  const isRope = layout.params.type === 'TWISTED_PAPER';
  const twist = useMemo(() => (isRope ? createTwistTexture() : null), [isRope]);
  useEffect(() => () => twist?.dispose(), [twist]);
  useEffect(() => {
    if (!twist) return;
    twist.repeat.set(twistRepeat(built.ropeLength, layout.params.width), 1);
  }, [twist, built, layout]);

  const stackThickness = handleStackThickness(layout);
  const halfExtent = handleHalfExtent(layout);
  const palette = PAPER_PALETTES[paperColor] ?? PAPER_PALETTES.BROWN;
  const handleColor = palette.paper;
  const patchColor = useMemo(() => '#' + new Color(palette.paper).multiplyScalar(PATCH_TONE).getHexString(), [palette.paper]);

  return (
    <group name="handles">
      {HANDLE_WALLS.map((wall) => (
        <group
          key={wall}
          name={`handle-${wall}`}
          userData={{ stackThickness, halfExtent }}
          ref={(g) => {
            wallGroups.current[wall] = g;
            return () => {
              if (wallGroups.current[wall] === g) wallGroups.current[wall] = null;
            };
          }}
        >
          <mesh geometry={built.handleGeometry} frustumCulled={false} userData={{ handle: wall }}>
            {twist ? (
              <meshStandardMaterial
                key="rope"
                color={handleColor}
                map={twist}
                bumpMap={twist}
                bumpScale={0.6}
                {...HANDLE_MATERIAL}
              />
            ) : (
              <meshStandardMaterial key="strip" color={handleColor} side={DoubleSide} {...HANDLE_MATERIAL} />
            )}
          </mesh>
          <mesh geometry={built.patchGeometry} frustumCulled={false} userData={{ patch: wall }}>
            <meshStandardMaterial color={patchColor} side={DoubleSide} {...HANDLE_MATERIAL} />
          </mesh>
          <mesh geometry={built.shadowGeometry} frustumCulled={false} renderOrder={1} userData={{ patchShadow: wall }}>
            <meshBasicMaterial color="#000000" transparent opacity={PATCH_SHADOW.opacity} depthWrite={false} side={DoubleSide} {...HANDLE_POLYGON_OFFSET} />
          </mesh>
          <Line points={built.outline} color={palette.edge} lineWidth={1} frustumCulled={false} />
        </group>
      ))}
    </group>
  );
}
