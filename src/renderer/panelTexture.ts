import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import type { CompositePlan } from '../domain/artworkComposite';
import { computePanelUvTransform, type PanelArtworkArea, type PanelUvTransform } from '../domain/artworkPlacement';
import type { ArtworkPlacement } from '../domain/types';

type Size = { width: number; height: number };

/**
 * Artwork textures by URL: a URL present in the map has settled — its texture, or null when it could not be loaded
 * (that artwork then shows as plain paper; the Canvas never crashes). A URL still loading is absent.
 */
export type ArtworkTextures = ReadonlyMap<string, Texture | null>;

function configureArtworkTexture(texture: Texture, gl: WebGLRenderer) {
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = gl.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
}

type TextureEntry = { texture: Texture | null; settled: boolean; cancelled: boolean };

/**
 * Loads every distinct artwork URL of the bag once, as a texture: sRGB, max anisotropy, `flipY = true` (UV (0,0) =
 * image bottom-left = panel bottom-left seen from outside). Walls share these (one GPU upload per image, whatever the
 * number of walls or layers using it). A texture is disposed as soon as its URL is no longer used (artwork replaced /
 * removed / layout switched) and all of them when the bag unmounts.
 */
export function useArtworkTextures(urls: readonly string[]): ArtworkTextures {
  const gl = useThree((s) => s.gl);
  const key = [...new Set(urls.filter(Boolean))].sort().join('\n');
  // Entries live across renders (loads in flight); the snapshot in state is what renders read.
  const entriesRef = useRef<Map<string, TextureEntry>>(new Map());
  const [snapshot, setSnapshot] = useState<ArtworkTextures>(() => new Map());

  useEffect(() => {
    const entries = entriesRef.current;
    const wanted = new Set(key ? key.split('\n') : []);
    const publish = () =>
      setSnapshot(
        new Map([...entries].filter(([, entry]) => entry.settled).map(([url, entry]) => [url, entry.texture] as const)),
      );
    let removed = false;
    for (const [url, entry] of entries) {
      if (wanted.has(url)) continue;
      releaseEntry(entry);
      entries.delete(url);
      removed = true;
    }
    for (const url of wanted) {
      if (entries.has(url)) continue;
      const entry: TextureEntry = { texture: null, settled: false, cancelled: false };
      entries.set(url, entry);
      new TextureLoader().load(
        url,
        (texture) => {
          if (entry.cancelled) {
            texture.dispose();
            return;
          }
          configureArtworkTexture(texture, gl);
          entry.texture = texture;
          entry.settled = true;
          publish();
        },
        undefined,
        () => {
          if (entry.cancelled) return;
          console.warn(`Artwork texture could not be loaded, showing plain paper: ${url}`);
          entry.settled = true;
          publish();
        },
      );
    }
    if (removed) publish();
  }, [key, gl]);

  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      entries.forEach(releaseEntry);
      entries.clear();
    };
  }, []);

  return snapshot;
}

function releaseEntry(entry: TextureEntry) {
  entry.cancelled = true;
  entry.texture?.dispose();
}

/** Draws the layers of `plan` bottom → top into the composite's canvas (failed images are skipped). */
function drawComposite(texture: CanvasTexture, plan: CompositePlan, textures: ArtworkTextures) {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of plan.layers) {
    const image = textures.get(layer.artwork.fileUrl)?.image as CanvasImageSource | undefined;
    if (!image) continue;
    const { matrix: m, clip } = layer;
    context.save();
    context.beginPath();
    context.rect(clip.x, clip.y, clip.width, clip.height);
    context.clip();
    context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    context.drawImage(image, 0, 0, layer.artwork.width, layer.artwork.height);
    context.restore();
  }
  texture.needsUpdate = true;
}

/**
 * A wall's composite of several artwork layers (docs/SPEC.md §3b): the layers of `plan` (`planArtworkComposite`)
 * drawn bottom → top, each clipped to its artwork area, into one canvas texture. The canvas is kept while its size
 * stays the same and redrawn in place when the plan or the images change (no new material per edit); it is disposed
 * (and its pixel buffer released) when the size changes and on unmount. Returns null until every layer image has
 * settled, so offscreen snapshots never capture a half-drawn composite.
 */
export function useCompositeTexture(plan: CompositePlan | null, textures: ArtworkTextures): Texture | null {
  const gl = useThree((s) => s.gl);
  const width = plan?.width ?? 0;
  const height = plan?.height ?? 0;
  const texture = useMemo(() => {
    if (width <= 0 || height <= 0 || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const composite = new CanvasTexture(canvas);
    configureArtworkTexture(composite, gl);
    return composite;
  }, [width, height, gl]);

  useEffect(
    () => () => {
      if (!texture) return;
      texture.dispose();
      const canvas = texture.image as HTMLCanvasElement;
      // Release the pixel buffer now instead of at garbage collection.
      canvas.width = 0;
      canvas.height = 0;
    },
    [texture],
  );

  const ready = !!plan && plan.layers.every((layer) => textures.has(layer.artwork.fileUrl));
  // Drawn before the browser paints (R3F renders the next frame after the commit).
  useLayoutEffect(() => {
    if (texture && plan && ready) drawComposite(texture, plan, textures);
  }, [texture, plan, textures, ready]);

  return ready ? texture : null;
}

/**
 * A wall's own view of a loaded texture: a clone sharing the image (`Source`, uploaded to the GPU once) with its own
 * transform, so several walls can show one image with different UV transforms (the whole-bag wrap, docs/SPEC.md §3a).
 * Disposed when the base texture changes or the wall unmounts (three.js frees the shared image with its last user).
 */
export function useTextureView(base: Texture | null): Texture | null {
  const view = useMemo(() => {
    if (!base) return null;
    const clone = base.clone();
    clone.needsUpdate = true; // a clone starts at version 0, which the renderer never uploads
    return clone;
  }, [base]);
  useEffect(() => () => view?.dispose(), [view]);
  return view;
}

/**
 * Applies the domain placement (`computePanelUvTransform` over the panel's artwork area) to the texture transform.
 * `area` is the artwork area in panel-local mm (`getPanelArtworkArea`: the wall, or wall + bottom allowance when the
 * placement extends to the bottom); the geometry UV stays (x / panelWidth, y / H), continued below v = 0 on the
 * bottom pieces. `texture.center` stays at (0, 0), as the domain contract requires.
 */
export function usePanelUvTransform(
  texture: Texture | null,
  panelSize: Size,
  imageWidth: number,
  imageHeight: number,
  placement: ArtworkPlacement,
  area?: PanelArtworkArea,
) {
  const { width: pw, height: ph } = panelSize;
  const ax = area?.x ?? 0;
  const ay = area?.y ?? 0;
  const aw = area?.width ?? pw;
  const ah = area?.height ?? ph;
  useLayoutEffect(() => {
    if (!texture) return;
    const image = texture.image as { width?: number; height?: number } | undefined;
    const size =
      imageWidth > 0 && imageHeight > 0
        ? { width: imageWidth, height: imageHeight }
        : { width: image?.width ?? 0, height: image?.height ?? 0 };
    applyUvTransform(
      texture,
      computePanelUvTransform({ width: pw, height: ph }, size, placement, { x: ax, y: ay, width: aw, height: ah }),
    );
  }, [texture, pw, ph, imageWidth, imageHeight, placement, ax, ay, aw, ah]);
}

/** Writes a domain UV transform into a (mutable, three.js-owned) texture; `center` stays (0, 0). */
function applyUvTransform(texture: Texture, { repeat, offset, rotation }: PanelUvTransform) {
  texture.center.set(0, 0);
  texture.repeat.set(repeat[0], repeat[1]);
  texture.offset.set(offset[0], offset[1]);
  texture.rotation = rotation;
  texture.updateMatrix();
}

/**
 * Shader patch for artwork materials: outside the image (texture coordinates beyond [0,1]², e.g. a scaled-down
 * CUSTOM placement) the panel shows the plain paper colour instead of clamped edge pixels, and transparent image
 * pixels show the paper underneath (the material colour stays the paper colour).
 */
export function clipArtworkToImage(shader: WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec2 insideImage = step( vec2( 0.0 ), vMapUv ) * step( vMapUv, vec2( 1.0 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, sampledDiffuseColor.rgb, sampledDiffuseColor.a * insideImage.x * insideImage.y );
#endif
`,
  );
}

export const ARTWORK_PROGRAM_KEY = 'bag-artwork-clip';
