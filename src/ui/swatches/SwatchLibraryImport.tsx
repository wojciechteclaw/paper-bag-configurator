import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SWATCH_LIBRARY_RULES } from '../../domain/config/productCatalog';
import { countSkipped, swatchLibraryKey, type SwatchLibrary } from '../../domain/swatches';
import { useSwatchLibraryStore, type SwatchImportError } from '../../state/swatchLibraryStore';
import { useFormatNumber } from '../useFormatNumber';

type ImportError = { fileName: string; error: SwatchImportError | 'READ_FAILED' };

const BYTES_PER_MB = 1024 * 1024;

/**
 * "Importuj wzornik (.ase)": the user's own licensed swatch libraries (e.g. exported from Pantone Connect), several at
 * once, kept only in this browser (docs/SPEC.md §4g). Nothing is bundled or sent anywhere.
 */
export function SwatchLibraryImport() {
  const { t } = useTranslation();
  const id = useId();
  const format = useFormatNumber();
  const inputRef = useRef<HTMLInputElement>(null);
  const libraries = useSwatchLibraryStore((s) => s.libraries);
  const importAse = useSwatchLibraryStore((s) => s.importAse);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);

  const importFile = async (file: File): Promise<ImportError | null> => {
    if (file.size > SWATCH_LIBRARY_RULES.maxFileSizeBytes) return { fileName: file.name, error: 'TOO_LARGE' };
    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch {
      return { fileName: file.name, error: 'READ_FAILED' };
    }
    const result = importAse(file.name, data);
    return result.ok ? null : { fileName: file.name, error: result.error };
  };

  const importFiles = async (files: File[]) => {
    setReading(true);
    const failed: ImportError[] = [];
    // One after another, so the limits see the libraries imported just before.
    for (const file of files) {
      const error = await importFile(file);
      if (error) failed.push(error);
    }
    setErrors(failed);
    setReading(false);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // Reset so choosing the same file again still fires a change.
    event.target.value = '';
    if (files.length > 0) void importFiles(files);
  };

  const errorParams = {
    max: format(SWATCH_LIBRARY_RULES.maxFileSizeBytes / BYTES_PER_MB, 1),
    maxLibraries: format(SWATCH_LIBRARY_RULES.maxLibraries),
    maxColors: format(SWATCH_LIBRARY_RULES.maxTotalColors),
  };

  return (
    <section className="swatch-library" aria-labelledby={`${id}-title`}>
      <h3 className="subheading" id={`${id}-title`}>
        {t('swatches.title')}
      </h3>
      <div className="swatch-library__actions">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={reading}>
          {t('swatches.import')}
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept={SWATCH_LIBRARY_RULES.accept}
          aria-label={t('swatches.fileInput')}
          onChange={onChange}
        />
      </div>
      <div aria-live="polite">
        {reading && <p className="note">{t('swatches.reading')}</p>}
        {libraries.length > 0 ? (
          <ul className="swatch-library__list" aria-label={t('swatches.listLabel')}>
            {libraries.map((library) => (
              <LibraryItem key={swatchLibraryKey(library)} library={library} />
            ))}
          </ul>
        ) : (
          <p className="note">{t('swatches.none')}</p>
        )}
      </div>
      {errors.map(({ fileName, error }) => (
        <small key={`${fileName}-${error}`} className="error" role="alert">
          {t('swatches.errorForFile', { fileName, message: t(`swatches.errors.${error}`, errorParams) })}
        </small>
      ))}
      <p className="note">{t('swatches.multiNote', { max: format(SWATCH_LIBRARY_RULES.maxLibraries) })}</p>
      <p className="note">{t('swatches.privacy')}</p>
    </section>
  );
}

function LibraryItem({ library }: { library: SwatchLibrary }) {
  const { t } = useTranslation();
  const format = useFormatNumber();
  const key = swatchLibraryKey(library);
  const sessionOnly = useSwatchLibraryStore((s) => s.sessionOnly.includes(key));
  const removeLibrary = useSwatchLibraryStore((s) => s.removeLibrary);
  const skipped = countSkipped(library);
  const approximate = library.swatches.filter((s) => s.approximate).length;

  return (
    <li className="swatch-library__item">
      <div className="swatch-library__row">
        <span className="swatch-library__status">
          {t('swatches.loaded', {
            name: library.name,
            fileName: library.fileName,
            colors: t('swatches.colors', { count: library.swatches.length, value: format(library.swatches.length) }),
          })}
        </span>
        <button type="button" onClick={() => removeLibrary(key)} aria-label={t('swatches.removeLibrary', { name: library.name })}>
          {t('swatches.remove')}
        </button>
      </div>
      {skipped > 0 && <small className="note">{t('swatches.skipped', { value: format(skipped) })}</small>}
      {approximate > 0 && <small className="note">{t('swatches.approximate', { value: format(approximate) })}</small>}
      {sessionOnly && <small className="warning">{t('swatches.notPersisted')}</small>}
    </li>
  );
}
