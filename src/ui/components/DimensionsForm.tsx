import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, DIMENSION_STEP_MM } from '../../domain/config/productCatalog';
import { getEffectiveLimits } from '../../domain/constraints';
import type { Dimensions } from '../../domain/types';
import { validateDimensionValue } from '../../domain/validation/dimensions';
import { useConfigurationStore } from '../../state/configurationStore';
import { DimensionIcon } from './DimensionIcon';
import { parseNumberDraft } from './parseNumberDraft';

type DimensionKey = keyof Dimensions;
type Drafts = Partial<Record<DimensionKey, string>>;

const FIELDS: DimensionKey[] = ['width', 'height', 'depth'];

/**
 * Each field keeps a local draft string so the user can type freely ("1" → "15" → "150") without being
 * clamped per keystroke. A draft that is already a valid value is committed immediately (live 3D update);
 * an invalid draft shows its error and is committed — clamped by the store — on blur or Enter.
 */
export function DimensionsForm() {
  const { t } = useTranslation();
  const idPrefix = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const setDimension = useConfigurationStore((s) => s.setDimension);
  const [drafts, setDrafts] = useState<Drafts>({});

  const limits = BAG_TYPES[productType].limits;
  const effective = getEffectiveLimits(dimensions, limits);

  const clearDraft = (key: DimensionKey) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

  const commit = (key: DimensionKey) => {
    const draft = drafts[key];
    if (draft === undefined) return;
    // The store clamps into the effective limits and snaps to the step; empty/NaN keeps the stored value.
    setDimension(key, parseNumberDraft(draft));
    clearDraft(key);
  };

  const change = (key: DimensionKey, raw: string) => {
    setDrafts((current) => ({ ...current, [key]: raw }));
    const value = parseNumberDraft(raw);
    if (validateDimensionValue(key, value, dimensions, limits) === null) setDimension(key, value);
  };

  const keyDown = (key: DimensionKey, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit(key);
    if (event.key === 'Escape') clearDraft(key);
  };

  const lockHint = (key: DimensionKey): string | null => {
    if (key === 'width' && dimensions.depth >= limits.width.min) {
      return t('dimensions.lock.widthMin', { value: dimensions.depth });
    }
    if (key === 'depth' && dimensions.width <= limits.depth.max) {
      return t('dimensions.lock.depthMax', { value: dimensions.width });
    }
    return null;
  };

  return (
    <fieldset>
      <legend>{t('dimensions.label')}</legend>
      {FIELDS.map((key) => {
        const id = `${idPrefix}-${key}`;
        const draft = drafts[key];
        const error = draft === undefined ? null : validateDimensionValue(key, parseNumberDraft(draft), dimensions, limits);
        const { min, max } = effective[key];
        const lock = lockHint(key);
        return (
          <div key={key} className="field field--dimension">
            <label htmlFor={id}>
              <DimensionIcon dimension={key} />
              <span>{t(`dimensions.${key}`)}</span>
            </label>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={DIMENSION_STEP_MM}
              value={draft ?? String(dimensions[key])}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
              onChange={(e) => change(key, e.target.value)}
              onBlur={() => commit(key)}
              onKeyDown={(e) => keyDown(key, e)}
            />
            <span>{t('dimensions.unit')}</span>
            <small id={`${id}-hint`} className="hint">
              {t('dimensions.range', { min, max })}
              {lock && <span className="hint__lock"> · {lock}</span>}
            </small>
            {error && (
              <small id={`${id}-error`} className="error">
                {t(`dimensions.errors.${error}`, { min: limits[key].min, max: limits[key].max, step: DIMENSION_STEP_MM })}
              </small>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
