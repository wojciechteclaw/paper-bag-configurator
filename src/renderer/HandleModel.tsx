import { useEffect, useMemo } from 'react';
import { DoubleSide, type BufferGeometry, type Group } from 'three';
import { getHandleLayout } from '../domain/geometry/handles';
import type { Dimensions, Handle } from '../domain/types';
import {
  createPatchGeometry,
  createRopeGeometry,
  createStripGeometry,
  createTwistTexture,
  HANDLE_WALLS,
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
  /** Filled with the two wall groups; BagModel writes their transforms (userData.stackThickness in mm). */
  wallGroups: { current: HandleWallGroups };
};

const HANDLE_MATERIAL = { roughness: 0.9, metalness: 0, envMapIntensity: 0.35 } as const;

export function HandleModel({ handle, dimensions, wallGroups }: HandleModelProps) {
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
    if (layout.params.type === 'TWISTED_PAPER') {
      const rope = createRopeGeometry(layout);
      return { patchGeometry, handleGeometry: rope.geometry as BufferGeometry, ropeLength: rope.length };
    }
    return { patchGeometry, handleGeometry: createStripGeometry(layout), ropeLength: 0 };
  }, [layout]);
  useEffect(
    () => () => {
      built.patchGeometry.dispose();
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
  const handleColor = layout.params.color;

  return (
    <group name="handles">
      {HANDLE_WALLS.map((wall) => (
        <group
          key={wall}
          name={`handle-${wall}`}
          userData={{ stackThickness }}
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
            <meshStandardMaterial color={handleColor} side={DoubleSide} {...HANDLE_MATERIAL} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
