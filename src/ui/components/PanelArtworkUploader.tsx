import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ARTWORK_RULES } from '../../domain/config/productCatalog';
import { createArtwork } from '../../domain/factories';
import { getArtworkSlot, getArtworkTargetSize } from '../../domain/artworkLayout';
import { getAspectRatio, hasAspectRatioMismatch } from '../../domain/panels';
import type { ArtworkTarget } from '../../domain/types';
import { validateArtworkFile, validateDecodedImage, type ArtworkError } from '../../domain/validation/artwork';
import { useConfigurationStore } from '../../state/configurationStore';
import { loadImageFile } from '../artwork/loadImageFile';
import { useFormatNumber } from '../useFormatNumber';

const MAX_MB = Math.round(ARTWORK_RULES.maxSizeBytes / (1024 * 1024));

/** Upload of the artwork of one wall, or of the whole-bag wrap (`position="WRAP"`, docs/SPEC.md §3a). */
export function PanelArtworkUploader({ position }: { position: ArtworkTarget }) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Incremented per upload; a result from an older request (or after unmount) is discarded.
  const requestRef = useRef(0);
  const [error, setError] = useState<ArtworkError | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const artwork = useConfigurationStore((s) => getArtworkSlot(s.configuration, position).artwork);
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const setPanelArtwork = useConfigurationStore((s) => s.setPanelArtwork);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  const isWrap = position === 'WRAP';
  const panelName = t(`artwork.${position}`);
  const panelSize = getArtworkTargetSize(position, dimensions);
  const mismatch = artwork !== null && hasAspectRatioMismatch(artwork, panelSize);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    const request = ++requestRef.current;
    const fileError = validateArtworkFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const image = await loadImageFile(file);
      if (request !== requestRef.current) {
        URL.revokeObjectURL(image.url);
        return;
      }
      const decodeError = validateDecodedImage(image);
      if (decodeError) {
        URL.revokeObjectURL(image.url);
        setError(decodeError);
        return;
      }
      setPanelArtwork(
        position,
        createArtwork({
          fileName: file.name,
          fileUrl: image.url,
          mimeType: file.type,
          width: image.width,
          height: image.height,
          sizeBytes: file.size,
        }),
      );
    } catch {
      if (request === requestRef.current) setError('DECODE_FAILED');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const openPicker = () => inputRef.current?.click();

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void accept(e.dataTransfer.files[0]);
    },
  };

  const zoneKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

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
              <button type="button" onClick={openPicker} aria-label={`${t('artwork.replace')}: ${panelName}`}>
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
          aria-label={t(isWrap ? 'artwork.dropZoneLabelWrap' : 'artwork.dropZoneLabel', { panel: panelName })}
          aria-describedby={`${id}-accepted`}
          onClick={openPicker}
          onKeyDown={zoneKeyDown}
          {...dropHandlers}
        >
          <span>{t('artwork.drop')}</span>
          <small>{t('artwork.choose')}</small>
          <small id={`${id}-accepted`}>{t('artwork.accepted', { maxMb: MAX_MB })}</small>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ARTWORK_RULES.acceptedMimeTypes.join(',')}
        aria-label={t(isWrap ? 'artwork.fileInputLabelWrap' : 'artwork.fileInputLabel', { panel: panelName })}
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div aria-live="polite">
        {loading && <small>{t('artwork.loading')}</small>}
        {error && (
          <small className="error" role="alert">
            {t(`artwork.errors.${error}`, { maxMb: MAX_MB })}
          </small>
        )}
        {mismatch && (
          <small className="warning">
            {t(isWrap ? 'artwork.aspectMismatchWrap' : 'artwork.aspectMismatch', {
              imageRatio: formatNumber(getAspectRatio(artwork), 2),
              panelRatio: formatNumber(getAspectRatio(panelSize), 2),
            })}
          </small>
        )}
      </div>
    </section>
  );
}
