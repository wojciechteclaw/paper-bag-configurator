import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ClampToEdgeWrapping, SRGBColorSpace, TextureLoader, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import { computePanelUvTransform, type PanelArtworkArea, type PanelUvTransform } from '../domain/artworkPlacement';
import type { ArtworkPlacement } from '../domain/types';

type Size = { width: number; height: number };

/**
 * Loads the artwork image of one panel as a texture: sRGB, max anisotropy, `flipY = true` (UV (0,0) = image
 * bottom-left = panel bottom-left seen from outside). Returns null while loading, without a URL, or when loading
 * fails (the panel then falls back to plain paper — the Canvas never crashes). The texture is disposed when the URL
 * changes (artwork replaced/removed) or the panel unmounts.
 */
export function usePanelTexture(url: string | null | undefined): Texture | null {
  const gl = useThree((s) => s.gl);
  const [loaded, setLoaded] = useState<{ url: string; texture: Texture } | null>(null);

  useEffect(() => {
    if (!url) return;
    let active = true;
    let texture: Texture | null = null;
    new TextureLoader().load(
      url,
      (t) => {
        if (!active) {
          t.dispose();
          return;
        }
        t.colorSpace = SRGBColorSpace;
        t.flipY = true;
        t.wrapS = ClampToEdgeWrapping;
        t.wrapT = ClampToEdgeWrapping;
        t.anisotropy = gl.capabilities.getMaxAnisotropy();
        t.needsUpdate = true;
        texture = t;
        setLoaded({ url, texture: t });
      },
      undefined,
      () => {
        if (!active) return;
        console.warn(`Artwork texture could not be loaded, showing plain paper: ${url}`);
        setLoaded(null);
      },
    );
    return () => {
      active = false;
      texture?.dispose();
    };
  }, [url, gl]);

  return url && loaded?.url === url ? loaded.texture : null;
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
