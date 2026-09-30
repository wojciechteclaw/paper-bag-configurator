import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, WINDOW_RULES } from '../../domain/config/productCatalog';
import type { BagWindow, WindowMaterial, WindowType } from '../../domain/types';
import {
  getWindow,
  getWindowDimensions,
  getWindowFilm,
  getWindowLimits,
  getWindowOpening,
  getWindowWarnings,
  validateWindowValue,
  type WindowDimensions,
  type WindowField,
} from '../../domain/window';
import { useConfigurationStore } from '../../state/configurationStore';
import { useFormatNumber } from '../useFormatNumber';
import { InfoTip } from './InfoTip';
import { parseNumberDraft } from './parseNumberDraft';

type Drafts = Partial<Record<WindowField, string>>;

const CHOICES: (WindowType | 'NONE')[] = ['NONE', ...WINDOW_RULES.types];

/**
 * "Okienko" — film window in the FRONT wall of the gusseted bag (docs/SPEC.md §2b). Step 1 below the dimensions: the
 * window is part of the construction (its limits follow W / H, it changes the dieline and blank) and should be chosen
 * before the artwork is placed (nothing prints in the opening). Hidden for bag types without windows.
 * Number fields keep drafts like DimensionsForm: a valid draft is committed at once, an invalid one shows its error
 * and is committed — constrained by the store — on blur or Enter.
 */
export function WindowConfigurator() {
  const productType = useConfigurationStore((s) => s.configuration.productType);
  if (!BAG_TYPES[productType].windowAvailable) return null;
  return <WindowFieldset />;
}

function WindowFieldset() {
  const { t } = useTranslation();
  const idPrefix = useId();
  const formatNumber = useFormatNumber();
  const configuredDimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const bottomFoldDepth = useConfigurationStore((s) => s.configuration.bottomFoldDepth);
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const dimensions = getWindowDimensions({ dimensions: configuredDimensions, bottomFoldDepth, productType });
  const bagWindow = useConfigurationStore((s) => getWindow(s.configuration));
  const setWindowType = useConfigurationStore((s) => s.setWindowType);
  const setWindowMaterial = useConfigurationStore((s) => s.setWindowMaterial);
  const setWindowValue = useConfigurationStore((s) => s.setWindowValue);
  const [drafts, setDrafts] = useState<Drafts>({});
  const current = bagWindow?.type ?? 'NONE';

  const select = (choice: WindowType | 'NONE') => {
    setDrafts({});
    setWindowType(choice === 'NONE' ? null : choice);
  };

  return (
    <fieldset className="window-configurator">
      <legend>{t('window.label')}</legend>
      <div className="variant-cards" role="radiogroup" aria-label={t('window.typeLabel')}>
        {CHOICES.map((choice) => {
          const id = `${idPrefix}-${choice}`;
          const checked = choice === current;
          return (
            <label key={choice} className={checked ? 'variant-card is-selected' : 'variant-card'}>
              <input
                type="radio"
                name={`${idPrefix}-windowType`}
                value={choice}
                checked={checked}
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-description`}
                onChange={() => select(choice)}
              />
              <span id={`${id}-title`} className="variant-card__title">
                {t(choice === 'NONE' ? 'window.none' : `window.type.${choice}`)}
              </span>
              <span id={`${id}-description`} className="variant-card__description">
                {t(`window.description.${choice}`)}
              </span>
            </label>
          );
        })}
      </div>
      {bagWindow && (
        <WindowDetails
          window={bagWindow}
          dimensions={dimensions}
          drafts={drafts}
          setDrafts={setDrafts}
          idPrefix={idPrefix}
          formatNumber={(value) => formatNumber(value, 1)}
          onMaterial={setWindowMaterial}
          onValue={setWindowValue}
        />
      )}
    </fieldset>
  );
}

type DetailsProps = {
  window: BagWindow;
  dimensions: WindowDimensions;
  drafts: Drafts;
  setDrafts: (update: (current: Drafts) => Drafts) => void;
  idPrefix: string;
  formatNumber: (value: number) => string;
  onMaterial: (material: WindowMaterial) => void;
  onValue: (field: WindowField, value: number) => void;
};

function WindowDetails({ window, dimensions, drafts, setDrafts, idPrefix, formatNumber, onMaterial, onValue }: DetailsProps) {
  const { t } = useTranslation();
  const limits = getWindowLimits(window, dimensions);
  const opening = getWindowOpening(window, dimensions);
  const film = getWindowFilm(window, dimensions);
  const warnings = getWindowWarnings(window, dimensions);
  const fields: WindowField[] =
    window.type === 'RECTANGLE' ? ['width', 'height', 'bottomOffset', 'filmOverlap'] : ['width', 'bottomOffset', 'filmOverlap'];
  const materialId = `${idPrefix}-material`;

  const clearDraft = (field: WindowField) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  const commit = (field: WindowField) => {
    const draft = drafts[field];
    if (draft === undefined) return;
    onValue(field, parseNumberDraft(draft));
    clearDraft(field);
  };
  const change = (field: WindowField, raw: string) => {
    setDrafts((current) => ({ ...current, [field]: raw }));
    const value = parseNumberDraft(raw);
    if (validateWindowValue(field, value, window, dimensions) === null) onValue(field, value);
  };
  const keyDown = (field: WindowField, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit(field);
    if (event.key === 'Escape') clearDraft(field);
  };

  return (
    <>
      <div className="field">
        <label htmlFor={materialId}>{t('window.materialLabel')}</label>
        <select id={materialId} value={window.material} onChange={(e) => onMaterial(e.target.value as WindowMaterial)}>
          {WINDOW_RULES.materials.map((material) => (
            <option key={material} value={material}>
              {t(`window.material.${material}`)}
            </option>
          ))}
        </select>
      </div>
      {fields.map((field) => {
        const id = `${idPrefix}-${field}`;
        const draft = drafts[field];
        const value = (window as Record<WindowField, number>)[field];
        const error = draft === undefined ? null : validateWindowValue(field, parseNumberDraft(draft), window, dimensions);
        const { min, max } = limits[field];
        return (
          <div key={field} className="field field--dimension">
            <label htmlFor={id}>
              <span aria-hidden="true" className="field__icon-spacer" />
              <span>{t(`window.field.${field}`)}</span>
            </label>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={field === 'filmOverlap' ? WINDOW_RULES.filmOverlap.step : WINDOW_RULES.step}
              value={draft ?? String(value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
              onChange={(e) => change(field, e.target.value)}
              onBlur={() => commit(field)}
              onKeyDown={(e) => keyDown(field, e)}
            />
            <span>{t('dimensions.unit')}</span>
            <InfoTip id={`${id}-hint`} label={t('common.moreInfo', { field: t(`window.field.${field}`) })}>
              {t('dimensions.range', { min, max })} · {t(`window.fieldInfo.${field}`)}
            </InfoTip>
            {error && (
              <small id={`${id}-error`} className="error">
                {t(`window.errors.${error}`, { min, max })}
              </small>
            )}
          </div>
        );
      })}
      <p className="note" data-testid="window-geometry">
        {t(opening.openAtTop ? 'window.geometry.PANORAMIC' : 'window.geometry.RECTANGLE', {
          width: formatNumber(opening.width),
          height: formatNumber(opening.height),
          bottom: formatNumber(opening.y),
          filmWidth: formatNumber(film.width),
          filmHeight: formatNumber(film.height),
        })}{' '}
        {t('window.artworkNote')}
      </p>
      {warnings.map((warning) => (
        <p key={warning} className="warning" role="status" data-warning={warning}>
          {t(`window.warnings.${warning}`, { share: Math.round(WINDOW_RULES.largeOpeningShare * 100) })}
        </p>
      ))}
    </>
  );
}
