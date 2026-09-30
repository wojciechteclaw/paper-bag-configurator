import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ARTWORK_RULES } from '../../domain/config/productCatalog';
import { getAspectRatio, getPanelSize, hasAspectRatioMismatch } from '../../domain/panels';
import type { PanelPosition } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';
import { ARTWORK_MAX_MB, useArtworkUpload } from '../artwork/useArtworkUpload';
import { useFormatNumber } from '../useFormatNumber';

/** Upload of the artwork of one wall (per-wall layout; layers: `ArtworkLayerList`). */
export function PanelArtworkUploader({ position }: { position: PanelPosition }) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const id = useId();

  const artwork = useConfigurationStore((s) => s.configuration.panels[position].artwork);
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const setPanelArtwork = useConfigurationStore((s) => s.setPanelArtwork);
  const upload = useArtworkUpload((accepted) => setPanelArtwork(position, accepted));
  const { error, setError, loading, dragging, dropHandlers } = upload;

  const panelName = t(`artwork.${position}`);
  const panelSize = getPanelSize(position, dimensions);
  const mismatch = artwork !== null && hasAspectRatioMismatch(artwork, panelSize);

  const remove = () => {
    setPanelArtwork(position, null);
    setError(null);
  };

  return (
    <section className="artwork-panel" aria-labelledby={`${id}-title`}>
      <header className="artwork-panel__header">
        <h3 id={`${id}-title`}>{panelName}</h3>
        <small>{t('artwork.panelSize', panelSize)}</small>
      </header>

      {artwork ? (
        <div className={dragging ? 'artwork-preview is-dragging' : 'artwork-preview'} {...dropHandlers}>
          <img src={artwork.fileUrl} alt={t('artwork.thumbnailAlt', { name: artwork.fileName })} />
          <div className="artwork-preview__meta">
            <span className="artwork-preview__name" title={artwork.fileName}>
              {artwork.fileName}
            </span>
            <small>{t('artwork.pixelSize', { width: artwork.width, height: artwork.height })}</small>
            <div className="artwork-preview__actions">
              <button type="button" onClick={upload.openPicker} aria-label={`${t('artwork.replace')}: ${panelName}`}>
                {t('artwork.replace')}
              </button>
              <button type="button" onClick={remove} aria-label={`${t('artwork.remove')}: ${panelName}`}>
                {t('artwork.remove')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={dragging ? 'dropzone is-dragging' : 'dropzone'}
          aria-label={t('artwork.dropZoneLabel', { panel: panelName })}
          aria-describedby={`${id}-accepted`}
          onClick={upload.openPicker}
          onKeyDown={upload.zoneKeyDown}
          {...dropHandlers}
        >
          <span>{t('artwork.drop')}</span>
          <small>{t('artwork.choose')}</small>
          <small id={`${id}-accepted`}>{t('artwork.accepted', { maxMb: ARTWORK_MAX_MB })}</small>
        </div>
      )}

      <input
        {...upload.inputProps}
        accept={ARTWORK_RULES.acceptedMimeTypes.join(',')}
        aria-label={t('artwork.fileInputLabel', { panel: panelName })}
      />

      <div aria-live="polite">
        {loading && <small>{t('artwork.loading')}</small>}
        {error && (
          <small className="error" role="alert">
            {t(`artwork.errors.${error}`, { maxMb: ARTWORK_MAX_MB })}
          </small>
        )}
        {mismatch && (
          <small className="warning">
            {t('artwork.aspectMismatch', {
              imageRatio: formatNumber(getAspectRatio(artwork), 2),
              panelRatio: formatNumber(getAspectRatio(panelSize), 2),
            })}
          </small>
        )}
      </div>
    </section>
  );
}
