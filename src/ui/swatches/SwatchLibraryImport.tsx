import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SWATCH_LIBRARY_RULES } from '../../domain/config/productCatalog';
import { countSkipped, type AseError } from '../../domain/swatches';
import { useSwatchLibraryStore } from '../../state/swatchLibraryStore';
import { useFormatNumber } from '../useFormatNumber';

type ImportStatus = { kind: 'reading' } | { kind: 'error'; error: AseError | 'READ_FAILED' } | null;

const BYTES_PER_MB = 1024 * 1024;

/**
 * "Importuj wzornik (.ase)": the user's own licensed swatch library (e.g. exported from Pantone Connect), kept only
 * in this browser (docs/SPEC.md §4g). Nothing is bundled or sent anywhere.
 */
export function SwatchLibraryImport() {
  const { t } = useTranslation();
  const id = useId();
  const format = useFormatNumber();
  const inputRef = useRef<HTMLInputElement>(null);
  const library = useSwatchLibraryStore((s) => s.library);
  const persisted = useSwatchLibraryStore((s) => s.persisted);
  const importAse = useSwatchLibraryStore((s) => s.importAse);
  const clearLibrary = useSwatchLibraryStore((s) => s.clearLibrary);
  const [status, setStatus] = useState<ImportStatus>(null);

  const importFile = async (file: File) => {
    if (file.size > SWATCH_LIBRARY_RULES.maxFileSizeBytes) {
      setStatus({ kind: 'error', error: 'TOO_LARGE' });
      return;
    }
    setStatus({ kind: 'reading' });
    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch {
      setStatus({ kind: 'error', error: 'READ_FAILED' });
      return;
    }
    const result = importAse(file.name, data);
    setStatus(result.ok ? null : { kind: 'error', error: result.error });
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change.
    event.target.value = '';
    if (file) void importFile(file);
  };

  const skipped = library ? countSkipped(library) : 0;
  const approximate = library ? library.swatches.filter((s) => s.approximate).length : 0;

  return (
    <section className="swatch-library" aria-labelledby={`${id}-title`}>
      <h3 className="subheading" id={`${id}-title`}>
        {t('swatches.title')}
      </h3>
      <div className="swatch-library__actions">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={status?.kind === 'reading'}>
          {t('swatches.import')}
        </button>
        {library && (
          <button
            type="button"
            onClick={() => {
              clearLibrary();
              setStatus(null);
            }}
          >
            {t('swatches.remove')}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={SWATCH_LIBRARY_RULES.accept}
          aria-label={t('swatches.fileInput')}
          onChange={onChange}
        />
      </div>
      <div aria-live="polite">
        {status?.kind === 'reading' && <p className="note">{t('swatches.reading')}</p>}
        {library ? (
          <>
            <p className="swatch-library__status">
              {t('swatches.loaded', {
                name: library.name,
                fileName: library.fileName,
                colors: t('swatches.colors', { count: library.swatches.length, value: format(library.swatches.length) }),
              })}
            </p>
            {skipped > 0 && <small className="note">{t('swatches.skipped', { value: format(skipped) })}</small>}
            {approximate > 0 && <small className="note">{t('swatches.approximate', { value: format(approximate) })}</small>}
            {!persisted && <small className="warning">{t('swatches.notPersisted')}</small>}
          </>
        ) : (
          <p className="note">{t('swatches.none')}</p>
        )}
      </div>
      {status?.kind === 'error' && (
        <small className="error" role="alert">
          {t(`swatches.errors.${status.error}`, { max: format(SWATCH_LIBRARY_RULES.maxFileSizeBytes / BYTES_PER_MB, 1) })}
        </small>
      )}
      <p className="note">{t('swatches.privacy')}</p>
    </section>
  );
}
