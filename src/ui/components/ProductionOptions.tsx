import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, PANTONE_CODE_MAX_LENGTH } from '../../domain/config/productCatalog';
import { validateQuantity, type PantoneError } from '../../domain/validation/production';
import { useConfigurationStore } from '../../state/configurationStore';
import { useFormatNumber } from '../useFormatNumber';
import { parseNumberDraft } from './parseNumberDraft';

export function ProductionOptions() {
  return (
    <>
      <PrintOptions />
      <PackagingOptions />
      <QuantityInput />
    </>
  );
}

function PrintOptions() {
  const { t } = useTranslation();
  const id = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const print = useConfigurationStore((s) => s.configuration.print);
  const addPantoneColor = useConfigurationStore((s) => s.addPantoneColor);
  const removePantoneColor = useConfigurationStore((s) => s.removePantoneColor);
  const [code, setCode] = useState('');
  const [error, setError] = useState<PantoneError | null>(null);

  const { maxColors } = BAG_TYPES[productType].print;
  const full = print.pantoneColors.length >= maxColors;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = addPantoneColor(code);
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
        <ul className="pantone-list" aria-labelledby={`${id}-colors`}>
          {print.pantoneColors.map((color, index) => (
            <li key={color}>
              <span>{color}</span>
              <button type="button" onClick={() => removePantoneColor(index)} aria-label={t('print.removeColor', { code: color })}>
                ×
              </button>
            </li>
          ))}
        </ul>
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
      </form>
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

/** Same draft pattern as DimensionsForm: valid drafts commit live, invalid ones are constrained on blur / Enter. */
function QuantityInput() {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const id = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const quantity = useConfigurationStore((s) => s.configuration.quantity);
  const setQuantity = useConfigurationStore((s) => s.setQuantity);
  const [draft, setDraft] = useState<string | null>(null);

  const { minQuantity } = BAG_TYPES[productType];
  const error = draft === null ? null : validateQuantity(parseNumberDraft(draft), minQuantity);

  const commit = () => {
    if (draft === null) return;
    setQuantity(parseNumberDraft(draft));
    setDraft(null);
  };

  return (
    <fieldset>
      <legend>{t('quantity.label')}</legend>
      <div className="field">
        <label htmlFor={id}>{t('quantity.label')}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={minQuantity}
          value={draft ?? String(quantity)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
          onChange={(e) => {
            setDraft(e.target.value);
            const value = parseNumberDraft(e.target.value);
            if (validateQuantity(value, minQuantity) === null) setQuantity(value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        <span>{t('quantity.unit')}</span>
        <small id={`${id}-hint`} className="hint">
          {t('quantity.min', { min: formatNumber(minQuantity) })}
        </small>
        {error && (
          <small id={`${id}-error`} className="error">
            {t(`quantity.errors.${error}`, { min: formatNumber(minQuantity) })}
          </small>
        )}
      </div>
    </fieldset>
  );
}
