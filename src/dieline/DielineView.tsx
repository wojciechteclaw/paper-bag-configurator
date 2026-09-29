import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  containPlacement,
  coverPlacement,
  movePlacement,
  rotatePlacement,
  scalePlacement,
} from '../domain/artworkPlacement';
import { ARTWORK_PLACEMENT_RULES } from '../domain/config/productionRules';
import { buildDieline, type DielineZoneKind } from '../domain/dieline';
import { getPanelSize } from '../domain/panels';
import type { ArtworkPlacement, PanelPosition, PaperColor } from '../domain/types';
import { useConfigurationStore } from '../state/configurationStore';
import { buildDielineScene, DIELINE_STYLE, matrixAttr, type SceneImage } from './scene';
import './dieline.css';

type LayerKey = 'artwork' | 'creases' | 'zones' | 'annotations' | 'labels';
const LAYER_KEYS: LayerKey[] = ['artwork', 'creases', 'zones', 'annotations', 'labels'];

const ZONE_PROPS: Record<DielineZoneKind, { className?: string; fill?: string }> = {
  BLEED: { className: 'dl-bleed' },
  SAFETY: { className: 'dl-safety' },
  BOTTOM_ALLOWANCE: { fill: DIELINE_STYLE.allowanceFill },
  BOTTOM_FLAP_GLUE: { fill: DIELINE_STYLE.bottomGlueFill },
  GLUE_FLAP: { fill: DIELINE_STYLE.glueFlapFill },
};

const PAPER_FILL: Record<PaperColor, string> = { WHITE: '#F4F1EA', BROWN: '#B8875A' };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;

type Drag =
  | { kind: 'pan'; pointerId: number; startClient: [number, number]; startCenter: [number, number]; moved: boolean }
  | { kind: 'move'; pointerId: number; panel: PanelPosition; start: [number, number]; placement: ArtworkPlacement }
  | {
      kind: 'scale';
      pointerId: number;
      panel: PanelPosition;
      centre: [number, number];
      startDistance: number;
      placement: ArtworkPlacement;
    };

/** Pointer position in SVG user units (mm), or null where the DOM has no layout (tests). */
function toSvgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): [number, number] | null {
  const ctm = svg?.getScreenCTM?.();
  if (!svg || !ctm) return null;
  const inv = ctm.inverse();
  return [inv.a * clientX + inv.c * clientY + inv.e, inv.b * clientX + inv.d * clientY + inv.f];
}

const centreOf = (image: SceneImage): [number, number] => [
  image.corners.reduce((sum, [x]) => sum + x, 0) / 4,
  image.corners.reduce((sum, [, y]) => sum + y, 0) / 4,
];

/**
 * 2D dieline preview and artwork editor (docs/SPEC.md §4b, §4c). No props: reads and writes the configuration store.
 * Artwork is placed with the same `computePanelUvTransform` as the 3D view.
 */
export function DielineView() {
  const { t } = useTranslation();
  const configuration = useConfigurationStore((s) => s.configuration);
  const setPanelPlacement = useConfigurationStore((s) => s.setPanelPlacement);
  const resetPanelPlacement = useConfigurationStore((s) => s.resetPanelPlacement);
  const { dimensions, handle, panels, paper } = configuration;

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    artwork: true,
    creases: true,
    zones: true,
    annotations: true,
    labels: true,
  });
  const [selected, setSelected] = useState<PanelPosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState<'svg' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const dieline = useMemo(() => buildDieline({ dimensions, handle }), [dimensions, handle]);
  const scene = useMemo(
    () =>
      buildDielineScene(dieline, panels, {
        label: (key) => t(`dieline.label.${key}`),
        dimension: (key, value) => t(`dieline.dimension.${key}`, { value: Math.round(value * 10) / 10 }),
      }),
    [dieline, panels, t],
  );

  // ——— View box (zoom / pan) ———
  const [bx, by, bw, bh] = scene.viewBox;
  const viewCenter: [number, number] = center ?? [bx + bw / 2, by + bh / 2];
  const vw = bw / zoom;
  const vh = bh / zoom;
  const viewBox = `${viewCenter[0] - vw / 2} ${viewCenter[1] - vh / 2} ${vw} ${vh}`;
  const handleRadius = Math.max(vw, vh) / 120;

  const zoomBy = useCallback(
    (factor: number, around?: [number, number]) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
      const f = next / zoom;
      if (f === 1) return;
      const c = center ?? [bx + bw / 2, by + bh / 2];
      const p = around ?? c;
      setZoom(next);
      setCenter([p[0] + (c[0] - p[0]) / f, p[1] + (c[1] - p[1]) / f]);
    },
    [zoom, center, bx, by, bw, bh],
  );
  const fitView = () => {
    setZoom(1);
    setCenter(null);
  };

  // ——— Placement editing ———
  const panelSizeOf = useCallback((position: PanelPosition) => getPanelSize(position, dimensions), [dimensions]);
  const applyPlacement = useCallback(
    (position: PanelPosition, update: (placement: ArtworkPlacement) => ArtworkPlacement) =>
      setPanelPlacement(position, update(useConfigurationStore.getState().configuration.panels[position].placement)),
    [setPanelPlacement],
  );
  const scaleSelected = (position: PanelPosition, factor: number) =>
    applyPlacement(position, (p) => scalePlacement(p, factor, panelSizeOf(position)));

  const selectedArtwork = selected ? panels[selected].artwork : null;
  const activeSelection = selectedArtwork ? selected : null;

  // Wheel: scale the selected artwork when over it, otherwise zoom the sheet. Native listener (React's is passive).
  const wheelState = useRef({ zoomBy, activeSelection, scale: scaleSelected });
  useLayoutEffect(() => {
    wheelState.current = { zoomBy, activeSelection, scale: scaleSelected };
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ARTWORK_PLACEMENT_RULES.scaleStep : 1 / ARTWORK_PLACEMENT_RULES.scaleStep;
      const state = wheelState.current;
      const target = event.target as Element | null;
      const panel = target?.closest?.('[data-panel]')?.getAttribute('data-panel') as PanelPosition | null;
      if (state.activeSelection && panel === state.activeSelection) {
        state.scale(panel, factor);
        return;
      }
      state.zoomBy(factor, toSvgPoint(svg, event.clientX, event.clientY) ?? undefined);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onBackgroundPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    dragRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startClient: [event.clientX, event.clientY],
      startCenter: viewCenter,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onArtworkPointerDown = (event: ReactPointerEvent<SVGGElement>, panel: PanelPosition) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelected(panel);
    const start = toSvgPoint(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    dragRef.current = { kind: 'move', pointerId: event.pointerId, panel, start, placement: panels[panel].placement };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onHandlePointerDown = (event: ReactPointerEvent<SVGCircleElement>, image: SceneImage) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const start = toSvgPoint(svgRef.current, event.clientX, event.clientY);
    if (!start) return;
    const centre = centreOf(image);
    dragRef.current = {
      kind: 'scale',
      pointerId: event.pointerId,
      panel: image.panel,
      centre,
      startDistance: Math.max(1e-6, Math.hypot(start[0] - centre[0], start[1] - centre[1])),
      placement: panels[image.panel].placement,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'pan') {
      const ctm = svgRef.current?.getScreenCTM?.();
      const dxPx = event.clientX - drag.startClient[0];
      const dyPx = event.clientY - drag.startClient[1];
      if (Math.hypot(dxPx, dyPx) > 3) drag.moved = true;
      if (!ctm || !drag.moved) return;
      setCenter([drag.startCenter[0] - dxPx / ctm.a, drag.startCenter[1] - dyPx / ctm.d]);
      return;
    }
    const point = toSvgPoint(svgRef.current, event.clientX, event.clientY);
    if (!point) return;
    const size = panelSizeOf(drag.panel);
    if (drag.kind === 'move') {
      // SVG y grows downwards, panel y upwards.
      setPanelPlacement(drag.panel, movePlacement(drag.placement, point[0] - drag.start[0], drag.start[1] - point[1], size));
    } else {
      const distance = Math.hypot(point[0] - drag.centre[0], point[1] - drag.centre[1]);
      setPanelPlacement(drag.panel, scalePlacement(drag.placement, distance / drag.startDistance, size));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'pan' && !drag.moved) setSelected(null);
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const onArtworkKeyDown = (event: KeyboardEvent<SVGGElement>, panel: PanelPosition) => {
    const size = panelSizeOf(panel);
    const step = event.shiftKey ? ARTWORK_PLACEMENT_RULES.nudgeLargeMm : ARTWORK_PLACEMENT_RULES.nudgeMm;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (event.key in moves) {
      const [dx, dy] = moves[event.key];
      setSelected(panel);
      applyPlacement(panel, (p) => movePlacement(p, dx, dy, size));
    } else if (event.key === '+' || event.key === '=') {
      setSelected(panel);
      scaleSelected(panel, ARTWORK_PLACEMENT_RULES.scaleStep);
    } else if (event.key === '-' || event.key === '_') {
      setSelected(panel);
      scaleSelected(panel, 1 / ARTWORK_PLACEMENT_RULES.scaleStep);
    } else if (event.key === 'r' || event.key === 'R') {
      setSelected(panel);
      applyPlacement(panel, (p) => rotatePlacement(p, size, event.shiftKey ? -1 : 1));
    } else if (event.key === '0') {
      resetPanelPlacement(panel);
    } else if (event.key === 'Enter' || event.key === ' ') {
      setSelected(panel);
    } else if (event.key === 'Escape') {
      setSelected(null);
    } else {
      return;
    }
    event.preventDefault();
  };

  // ——— Export ———
  const baseName = `${t('dieline.export.fileName')}-${dimensions.width}x${dimensions.height}x${dimensions.depth}`;
  const svgTitle = t('dieline.svgTitle', dimensions);
  const runExport = async (kind: 'svg' | 'pdf') => {
    setBusy(kind);
    setExportError(false);
    try {
      if (kind === 'svg') {
        const { exportDielineSvgFile } = await import('./exportSvg');
        await exportDielineSvgFile(scene, `${baseName}.svg`, svgTitle);
      } else {
        const { exportDielinePdfFile } = await import('./exportPdf');
        await exportDielinePdfFile(scene, `${baseName}.pdf`, svgTitle);
      }
    } catch {
      setExportError(true);
    } finally {
      setBusy(null);
    }
  };

  const panelName = (position: PanelPosition) => t(`dieline.panel.${position}`);
  const hasArtwork = scene.images.length > 0;
  const firstImageOfPanel = new Set<string>();
  const s = DIELINE_STYLE;
  const selectedPlacement = activeSelection ? panels[activeSelection].placement : null;

  return (
    <div className="dieline-view" data-testid="dieline-view">
      <div className="dieline-view__toolbar">
        <fieldset className="dieline-view__layers">
          <legend className="visually-hidden">{t('dieline.layers.legend')}</legend>
          {LAYER_KEYS.map((key) => (
            <label key={key} className="dieline-view__toggle">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))}
              />
              {t(`dieline.layers.${key}`)}
            </label>
          ))}
        </fieldset>
        <div className="dieline-view__actions">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label={t('dieline.zoom.out')} title={t('dieline.zoom.out')}>
            −
          </button>
          <button type="button" onClick={fitView} aria-label={t('dieline.zoom.fit')} title={t('dieline.zoom.fit')}>
            ⤢
          </button>
          <button type="button" onClick={() => zoomBy(1.25)} aria-label={t('dieline.zoom.in')} title={t('dieline.zoom.in')}>
            +
          </button>
          <button type="button" onClick={() => void runExport('svg')} disabled={busy !== null}>
            {busy === 'svg' ? t('dieline.export.busy') : t('dieline.export.svg')}
          </button>
          <button type="button" onClick={() => void runExport('pdf')} disabled={busy !== null}>
            {busy === 'pdf' ? t('dieline.export.busy') : t('dieline.export.pdf')}
          </button>
        </div>
      </div>
      {exportError && (
        <p role="alert" className="dieline-view__error">
          {t('dieline.export.error')}
        </p>
      )}

      {activeSelection && selectedPlacement && (
        <div className="dieline-view__edit" role="toolbar" aria-label={t('dieline.edit.toolbar', { panel: panelName(activeSelection) })}>
          <strong>{panelName(activeSelection)}</strong>
          <span className="dieline-view__readout">
            {selectedPlacement.mode === 'FILL'
              ? t('dieline.edit.modeFill')
              : t('dieline.edit.modeCustom', {
                  scale: Math.round(selectedPlacement.scale * 100),
                  x: Math.round(selectedPlacement.offsetX),
                  y: Math.round(selectedPlacement.offsetY),
                  rotation: selectedPlacement.rotation,
                })}
          </span>
          <button type="button" aria-pressed={selectedPlacement.mode === 'FILL'} onClick={() => resetPanelPlacement(activeSelection)}>
            {t('dieline.edit.fill')}
          </button>
          <button
            type="button"
            onClick={() =>
              applyPlacement(activeSelection, (p) => containPlacement(p.mode === 'CUSTOM' ? p.rotation : 0))
            }
          >
            {t('dieline.edit.contain')}
          </button>
          <button
            type="button"
            onClick={() =>
              applyPlacement(activeSelection, (p) =>
                coverPlacement(panelSizeOf(activeSelection), selectedArtwork!, p.mode === 'CUSTOM' ? p.rotation : 0),
              )
            }
          >
            {t('dieline.edit.cover')}
          </button>
          <button
            type="button"
            aria-label={t('dieline.edit.scaleDown')}
            title={t('dieline.edit.scaleDown')}
            onClick={() => scaleSelected(activeSelection, 1 / ARTWORK_PLACEMENT_RULES.scaleStep)}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t('dieline.edit.scaleUp')}
            title={t('dieline.edit.scaleUp')}
            onClick={() => scaleSelected(activeSelection, ARTWORK_PLACEMENT_RULES.scaleStep)}
          >
            +
          </button>
          <button
            type="button"
            aria-label={t('dieline.edit.rotate')}
            title={t('dieline.edit.rotate')}
            onClick={() => applyPlacement(activeSelection, (p) => rotatePlacement(p, panelSizeOf(activeSelection)))}
          >
            ⟲
          </button>
          <button type="button" onClick={() => resetPanelPlacement(activeSelection)}>
            {t('dieline.edit.reset')}
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            {t('dieline.edit.done')}
          </button>
        </div>
      )}

      <div className="dieline-view__canvas">
        <svg
          ref={svgRef}
          className="dieline-view__svg"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t('dieline.canvasLabel', {
            ...dimensions,
            sheetWidth: scene.sheet.width,
            sheetHeight: scene.sheet.height,
          })}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            {scene.images.map((image) => (
              <clipPath key={image.clip.id} id={`dv-${image.clip.id}`}>
                <rect x={image.clip.x} y={image.clip.y} width={image.clip.width} height={image.clip.height} />
              </clipPath>
            ))}
          </defs>

          <rect
            x={0}
            y={0}
            width={scene.sheet.width}
            height={scene.sheet.height}
            fill={PAPER_FILL[paper.color] ?? s.sheetFill}
          />

          {layers.artwork && (
            <g data-layer="artwork">
              {scene.images.map((image) => {
                const focusable = !firstImageOfPanel.has(image.panel);
                firstImageOfPanel.add(image.panel);
                return (
                  <g
                    key={image.id}
                    data-panel={image.panel}
                    className={`dieline-view__artwork${activeSelection === image.panel ? ' is-selected' : ''}`}
                    clipPath={`url(#dv-${image.clip.id})`}
                    tabIndex={focusable ? 0 : undefined}
                    role={focusable ? 'button' : undefined}
                    aria-label={focusable ? t('dieline.edit.artworkLabel', { panel: panelName(image.panel) }) : undefined}
                    aria-pressed={focusable ? activeSelection === image.panel : undefined}
                    onPointerDown={(event) => onArtworkPointerDown(event, image.panel)}
                    onKeyDown={(event) => onArtworkKeyDown(event, image.panel)}
                    onFocus={() => setSelected(image.panel)}
                  >
                    <image
                      href={image.href}
                      x={0}
                      y={0}
                      width={1}
                      height={1}
                      preserveAspectRatio="none"
                      transform={matrixAttr(image.matrix)}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {layers.zones && (
            <g data-layer="zones" pointerEvents="none">
              {scene.zones.map((zone) => (
                <rect
                  key={zone.id}
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  data-zone={zone.kind}
                  {...ZONE_PROPS[zone.kind]}
                />
              ))}
              {scene.patches.map((patch) => (
                <rect
                  key={patch.id}
                  x={patch.x}
                  y={patch.y}
                  width={patch.width}
                  height={patch.height}
                  className="dl-patch"
                />
              ))}
            </g>
          )}

          {layers.creases && (
            <g data-layer="crease" pointerEvents="none">
              {scene.creases.map((line) => (
                <line
                  key={line.id}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  className="dl-crease"
                  data-code={line.code}
                />
              ))}
            </g>
          )}

          <g data-layer="cut" pointerEvents="none">
            {scene.cuts.map((d) => (
              <path key={d} d={d} className="dl-cut" />
            ))}
          </g>

          {layers.annotations && (
            <g data-layer="annotations" pointerEvents="none" className="dieline-view__text">
              {scene.dimensions.map((dimension) => (
                <g key={dimension.id}>
                  <line {...dimension.line} className="dl-dim" />
                  {dimension.extensions.map((extension, i) => (
                    <line key={i} {...extension} className="dl-dim" />
                  ))}
                  <text
                    x={dimension.text.x}
                    y={dimension.text.y}
                    fontSize={dimension.text.size}
                    textAnchor="middle"
                    transform={dimension.text.rotate ? `rotate(${dimension.text.rotate} ${dimension.text.x} ${dimension.text.y})` : undefined}
                  >
                    {dimension.text.text}
                  </text>
                </g>
              ))}
            </g>
          )}

          {layers.labels && (
            <g data-layer="labels" pointerEvents="none" className="dieline-view__text dieline-view__labels">
              {scene.labels.map((label) => (
                <text
                  key={label.id}
                  x={label.x}
                  y={label.y}
                  fontSize={label.size}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={label.rotate ? `rotate(${label.rotate} ${label.x} ${label.y})` : undefined}
                >
                  {label.text}
                </text>
              ))}
            </g>
          )}

          {layers.artwork && activeSelection && (
            <g data-layer="selection">
              {scene.images
                .filter((image) => image.panel === activeSelection)
                .map((image) => (
                  <g key={image.id}>
                    <polygon
                      points={image.corners.map((corner) => corner.join(',')).join(' ')}
                      className="dieline-view__frame"
                      pointerEvents="none"
                    />
                    {image.corners.map(([x, y], i) => (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={handleRadius}
                        className="dieline-view__handle"
                        aria-label={t('dieline.edit.handle')}
                        onPointerDown={(event) => onHandlePointerDown(event, image)}
                      />
                    ))}
                  </g>
                ))}
            </g>
          )}
        </svg>
      </div>

      <div className="dieline-view__footer">
        <ul className="dieline-view__legend">
          <li><span className="swatch swatch--cut" />{t('dieline.legend.cut')}</li>
          <li><span className="swatch swatch--crease" />{t('dieline.legend.crease')}</li>
          <li><span className="swatch swatch--patch" />{t('dieline.legend.patch')}</li>
          <li><span className="swatch swatch--bleed" />{t('dieline.legend.bleed')}</li>
          <li><span className="swatch swatch--safety" />{t('dieline.legend.safety')}</li>
          <li><span className="swatch swatch--allowance" />{t('dieline.legend.allowance')}</li>
          <li><span className="swatch swatch--glue" />{t('dieline.legend.glue')}</li>
        </ul>
        <p className="dieline-view__hint">{hasArtwork ? t('dieline.edit.hint') : t('dieline.empty')}</p>
      </div>
    </div>
  );
}
