import { ContactShadows } from '@react-three/drei';
import { useLayoutEffect, useMemo } from 'react';
import { resolvePanelArtworks } from '../domain/artworkLayout';
import type { BagConfiguration } from '../domain/types';
import { BagModel } from './BagModel';
import { BACKGROUND_COLOR } from './camera';
import { CONTACT_SHADOW_DEPTH_MM, MM_TO_SCENE } from './constants';
import { StudioLighting } from './lighting';

export type SnapshotSceneProps = {
  configuration: BagConfiguration;
  foldProgress: number;
  /** Called once React has committed this fold state (the snapshot loop waits for it before rendering). */
  onCommit?: (foldProgress: number) => void;
};

/** Scene of the offscreen snapshots: the same background, lighting rig, bag and contact shadow as BagPreview3D. */
export function SnapshotScene({ configuration, foldProgress, onCommit }: SnapshotSceneProps) {
  useLayoutEffect(() => {
    onCommit?.(foldProgress);
  }, [foldProgress, onCommit]);
  const { dimensions } = configuration;
  const artworks = useMemo(() => resolvePanelArtworks(configuration), [configuration]);
  const w = dimensions.width * MM_TO_SCENE;
  const h = dimensions.height * MM_TO_SCENE;
  const d = dimensions.depth * MM_TO_SCENE;
  return (
    <>
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <StudioLighting />
      <BagModel
        dimensions={dimensions}
        paperColor={configuration.paper.color}
        artworks={artworks}
        handle={configuration.handle}
        foldProgress={foldProgress}
      />
      <ContactShadows position={[0, -CONTACT_SHADOW_DEPTH_MM * MM_TO_SCENE, 0]} opacity={0.45} scale={Math.max(w, d) * 4} blur={2.4} far={h} />
    </>
  );
}
