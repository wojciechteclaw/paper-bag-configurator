import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, PANTONE_CODE_MAX_LENGTH } from '../../domain/config/productCatalog';
import { findSwatchByCode } from '../../domain/swatches';
import type { PantoneError } from '../../domain/validation/production';
import { useConfigurationStore } from '../../state/configurationStore';
import { useSwatchLibraryStore } from '../../state/swatchLibraryStore';
import { SwatchLibraryImport } from '../swatches/SwatchLibraryImport';

export function ProductionOptions() {
  return (
    <>
      <PrintOptions />
      <PackagingOptions />
    </>
  );
}

function PrintOptions() {
  const { t } = useTranslation();
  const id = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const print = useConfigurationStore((s) => s.configuration.print);
  const addPantoneColor = useConfigurationStore((s) => s.addPantoneColor);
  const setPantoneColorHex = useConfigurationStore((s) => s.setPantoneColorHex);
  const removePantoneColor = useConfigurationStore((s) => s.removePantoneColor);
  const [code, setCode] = useState('');
  const [error, setError] = useState<PantoneError | null>(null);
  // Imported swatch libraries (docs/SPEC.md §4g): their colour wins over the built-in preview suggestions.
  const codeIndex = useSwatchLibraryStore((s) => s.codeIndex);
  const typedSwatch = findSwatchByCode(codeIndex, code);

  const { maxColors } = BAG_TYPES[productType].print;
  const full = print.pantoneColors.length >= maxColors;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = addPantoneColor(code, findSwatchByCode(codeIndex, code)?.hex);
    setError(result);
    if (!result) setCode('');
  };

  return (
    <fieldset>
      <legend>{t('print.label')}</legend>
      <p className="field-row">
        <span>{t('print.technology')}:</span> <strong>{t(`print.${print.technology}`)}</strong>
      </p>

      <h3 className="subheading" id={`${id}-colors`}>
        {t('print.colors')}{' '}
        <small>
          ({t('print.usage', { current: print.pantoneColors.length, max: maxColors })}, {t('print.maxColors', { max: maxColors })})
        </small>
      </h3>
      {print.pantoneColors.length === 0 ? (
        <p className="note">{t('print.none')}</p>
      ) : (
        <>
          <ul className="pantone-list" aria-labelledby={`${id}-colors`}>
            {print.pantoneColors.map((color, index) => {
              const swatch = findSwatchByCode(codeIndex, color.code);
              return (
                <li key={color.code}>
                  <input
                    type="color"
                    className="pantone-list__picker"
                    value={color.hex}
                    aria-label={t('print.previewColor', { code: color.code })}
                    title={t('print.previewColor', { code: color.code })}
                    onChange={(e) => setPantoneColorHex(index, e.target.value)}
                  />
                  <span>{color.code}</span>
                  {swatch && swatch.hex === color.hex && (
                    <small className="badge" title={t('swatches.fromLibraryTitle', { name: swatch.library })}>
                      {t('swatches.fromLibrary')}
                    </small>
                  )}
                  {swatch && swatch.hex !== color.hex && (
                    <button
                      type="button"
                      className="pantone-list__library"
                      onClick={() => setPantoneColorHex(index, swatch.hex)}
                      aria-label={t('swatches.useLibraryColorFor', { code: color.code })}
                      title={t('swatches.useLibraryColorFor', { code: color.code })}
                    >
                      {t('swatches.useLibraryColor')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePantoneColor(index)}
                    aria-label={t('print.removeColor', { code: color.code })}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="note">{t('print.previewNote')}</p>
        </>
      )}

      <form className="pantone-form" onSubmit={submit} noValidate>
        <label htmlFor={`${id}-code`}>{t('print.newColor')}</label>
        <input
          id={`${id}-code`}
          type="text"
          value={code}
          placeholder={t('print.placeholder')}
          maxLength={PANTONE_CODE_MAX_LENGTH}
          disabled={full}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
        />
        <button type="submit" disabled={full}>
          {t('print.add')}
        </button>
        {(error || full) && (
          <small id={`${id}-error`} className={error ? 'error' : 'note'} role={error ? 'alert' : undefined}>
            {t(`print.errors.${error ?? 'LIMIT_REACHED'}`, { max: error === 'TOO_LONG' ? PANTONE_CODE_MAX_LENGTH : maxColors })}
          </small>
        )}
        {typedSwatch && !error && !full && (
          <small className="note pantone-form__library">
            <span className="swatch" style={{ background: typedSwatch.hex }} aria-hidden="true" />{' '}
            {t('swatches.inLibrary', { name: typedSwatch.name, library: typedSwatch.library })}
          </small>
        )}
      </form>

      <SwatchLibraryImport />
    </fieldset>
  );
}

function PackagingOptions() {
  const { t } = useTranslation();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const packaging = useConfigurationStore((s) => s.configuration.packaging);
  const setPackaging = useConfigurationStore((s) => s.setPackaging);

  return (
    <fieldset>
      <legend>{t('packaging.label')}</legend>
      <div className="choice-group choice-group--inline">
        {BAG_TYPES[productType].packaging.map((option) => (
          <label key={option} className="choice">
            <input
              type="radio"
              name="packaging"
              value={option}
              checked={packaging === option}
              onChange={() => setPackaging(option)}
            />
            <span>{t(`packaging.${option}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
