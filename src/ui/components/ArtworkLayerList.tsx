import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getArtworkTargetSize, getLayers, layerTarget } from '../../domain/artworkLayout';
import { ARTWORK_PRINT_DPI, ARTWORK_RULES, MAX_WRAP_ARTWORK_LAYERS } from '../../domain/config/productCatalog';
import { getAspectRatio, hasAspectRatioMismatch } from '../../domain/panels';
import type { ArtworkLayer, LayeredArtworkLayout } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';
import { useConfiguratorUiStore } from '../../state/configuratorUiStore';
import { usePreviewStore } from '../../state/previewStore';
import { ARTWORK_MAX_MB, useArtworkUpload } from '../artwork/useArtworkUpload';
import { useFormatNumber } from '../useFormatNumber';

const ACCEPT = ARTWORK_RULES.acceptedMimeTypes.join(',');
const MM_PER_INCH = 25.4;

/**
 * Artwork layers of a layered layout — whole bag (`WRAP`, docs/SPEC.md §3b) or whole dieline sheet (`SHEET`, §3c): list
 * (top layer first, as in graphics tools) with thumbnail, name and placement, move up / down, replace, remove;
 * selection shared with the dieline editor; an "add layer" drop zone with the same validation as the wall uploaders.
 * For the sheet the header gives the print-file size in mm and in px at `ARTWORK_PRINT_DPI`.
 */
export function ArtworkLayerList({ layout }: { layout: LayeredArtworkLayout }) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const id = useId();
  const layers = useConfigurationStore((s) => getLayers(s.configuration, layout));
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const glueFlapWidth = useConfigurationStore((s) => s.configuration.glueFlapWidth);
  const bottomFoldDepth = useConfigurationStore((s) => s.configuration.bottomFoldDepth);
  const addArtworkLayer = useConfigurationStore((s) => s.addArtworkLayer);
  const removeArtworkLayer = useConfigurationStore((s) => s.removeArtworkLayer);
  const moveArtworkLayer = useConfigurationStore((s) => s.moveArtworkLayer);
  const setPanelArtwork = useConfigurationStore((s) => s.setPanelArtwork);
  const selected = useConfiguratorUiStore((s) => s.selectedArtwork);
  const selectArtwork = useConfiguratorUiStore((s) => s.selectArtwork);
  const previewMode = usePreviewStore((s) => s.viewMode);
  const setPreviewMode = usePreviewStore((s) => s.setViewMode);
  const sheet = layout === 'SHEET';
  const targetOf = (layerId: string) => layerTarget(layout, layerId);

  const add = useArtworkUpload((artwork) => {
    const layerId = addArtworkLayer(layout, artwork);
    if (layerId) selectArtwork(targetOf(layerId));
  });
  // One picker for "replace" of any layer: the layer it was opened for.
  const replaceFor = useRef<string | null>(null);
  const replace = useArtworkUpload((artwork) => {
    const layerId = replaceFor.current;
    if (layerId && getLayers(useConfigurationStore.getState().configuration, layout).some((layer) => layer.id === layerId)) {
      setPanelArtwork(targetOf(layerId), artwork);
    } else if (artwork.fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(artwork.fileUrl); // the layer was removed meanwhile
    }
  });

  // What the layers are printed on: the four walls around the bag, or the whole dieline sheet.
  const areaSize = getArtworkTargetSize(targetOf('size'), { dimensions, productType, glueFlapWidth, bottomFoldDepth });
  const full = layers.length >= MAX_WRAP_ARTWORK_LAYERS;
  const layerName = (index: number) => t('artwork.layers.layerName', { index: index + 1 });
  const sizeText = sheet
    ? t('artwork.layers.sheetSize', {
        width: formatNumber(areaSize.width, 1),
        height: formatNumber(areaSize.height, 1),
        pxWidth: Math.round((areaSize.width / MM_PER_INCH) * ARTWORK_PRINT_DPI),
        pxHeight: Math.round((areaSize.height / MM_PER_INCH) * ARTWORK_PRINT_DPI),
        dpi: ARTWORK_PRINT_DPI,
      })
    : t('artwork.panelSize', areaSize);

  const placementText = (layer: ArtworkLayer) => {
    const { placement } = layer;
    const text =
      placement.mode === 'FILL'
        ? t(sheet ? 'artwork.layers.placementFillSheet' : 'artwork.layers.placementFill')
        : t('artwork.layers.placementCustom', { scale: formatNumber(placement.scale * 100, 0) });
    // The sheet always includes the bottom allowance: no need to say so per layer.
    return placement.extendToBottom && !sheet ? `${text} · ${t('artwork.layers.extended')}` : text;
  };

  const remove = (layer: ArtworkLayer) => {
    if (selected === targetOf(layer.id)) selectArtwork(null);
    removeArtworkLayer(layout, layer.id);
    replace.setError(null);
  };

  const openReplace = (layer: ArtworkLayer) => {
    replaceFor.current = layer.id;
    replace.openPicker();
  };

  return (
    <section className="artwork-panel wrap-layers" aria-labelledby={`${id}-title`}>
      <header className="artwork-panel__header">
        <h3 id={`${id}-title`}>{t('artwork.layers.title')}</h3>
        <small>
          {sizeText} · {t('artwork.layers.count', { count: layers.length, max: MAX_WRAP_ARTWORK_LAYERS })}
        </small>
      </header>
      <p className="note">{t(sheet ? 'artwork.layers.orderNoteSheet' : 'artwork.layers.orderNote')}</p>

      {layers.length === 0 ? (
        <p className="note">{t('artwork.layers.empty')}</p>
      ) : (
        <ul className="wrap-layers__list" aria-label={t('artwork.layers.listLabel')}>
          {layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => {
              const target = targetOf(layer.id);
              const isSelected = selected === target;
              const name = layerName(index);
              const mismatch = layer.placement.mode === 'FILL' && hasAspectRatioMismatch(layer.artwork, areaSize);
              return (
                <li key={layer.id} className={isSelected ? 'wrap-layer is-selected' : 'wrap-layer'} data-layer-id={layer.id}>
                  <button
                    type="button"
                    className="wrap-layer__select"
                    aria-pressed={isSelected}
                    aria-label={t('artwork.layers.select', { layer: name, name: layer.artwork.fileName })}
                    onClick={() => selectArtwork(isSelected ? null : target)}
                  >
                    <img src={layer.artwork.fileUrl} alt="" />
                    <span className="wrap-layer__text">
                      <strong>{name}</strong>
                      <span className="wrap-layer__file" title={layer.artwork.fileName}>
                        {layer.artwork.fileName}
                      </span>
                      <small>{placementText(layer)}</small>
                    </span>
                  </button>
                  <div className="wrap-layer__actions">
                    <button
                      type="button"
                      aria-label={t('artwork.layers.moveUp', { layer: name })}
                      title={t('artwork.layers.moveUp', { layer: name })}
                      disabled={index === layers.length - 1}
                      onClick={() => moveArtworkLayer(layout, layer.id, 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t('artwork.layers.moveDown', { layer: name })}
                      title={t('artwork.layers.moveDown', { layer: name })}
                      disabled={index === 0}
                      onClick={() => moveArtworkLayer(layout, layer.id, -1)}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => openReplace(layer)} aria-label={`${t('artwork.replace')}: ${name}`}>
                      {t('artwork.replace')}
                    </button>
                    <button type="button" onClick={() => remove(layer)} aria-label={`${t('artwork.remove')}: ${name}`}>
                      {t('artwork.remove')}
                    </button>
                    {isSelected && previewMode !== 'DIELINE' && (
                      <button type="button" onClick={() => setPreviewMode('DIELINE')}>
                        {t('artwork.layers.editOnDieline')}
                      </button>
                    )}
                  </div>
                  {mismatch && (
                    <small className="warning">
                      {t(sheet ? 'artwork.aspectMismatchSheet' : 'artwork.aspectMismatchWrap', {
                        imageRatio: formatNumber(getAspectRatio(layer.artwork), 2),
                        panelRatio: formatNumber(getAspectRatio(areaSize), 2),
                      })}
                    </small>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {full ? (
        <p className="note">{t('artwork.layers.maxReached', { max: MAX_WRAP_ARTWORK_LAYERS })}</p>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={add.dragging ? 'dropzone dropzone--compact is-dragging' : 'dropzone dropzone--compact'}
          aria-label={t(sheet ? 'artwork.layers.addDropLabelSheet' : 'artwork.layers.addDropLabel')}
          aria-describedby={`${id}-accepted`}
          onClick={add.openPicker}
          onKeyDown={add.zoneKeyDown}
          {...add.dropHandlers}
        >
          <span>{t(layers.length === 0 ? 'artwork.layers.addFirst' : 'artwork.layers.add')}</span>
          <small>{t('artwork.choose')}</small>
          <small id={`${id}-accepted`}>{t('artwork.accepted', { maxMb: ARTWORK_MAX_MB })}</small>
        </div>
      )}

      <input {...add.inputProps} accept={ACCEPT} aria-label={t('artwork.layers.addFileInputLabel')} />
      <input {...replace.inputProps} accept={ACCEPT} aria-label={t('artwork.layers.replaceFileInputLabel')} />

      <div aria-live="polite">
        {(add.loading || replace.loading) && <small>{t('artwork.loading')}</small>}
        {[add.error, replace.error].map(
          (error, i) =>
            error && (
              <small key={i} className="error" role="alert">
                {t(`artwork.errors.${error}`, { maxMb: ARTWORK_MAX_MB })}
              </small>
            ),
        )}
      </div>
    </section>
  );
}
