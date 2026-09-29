import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, DIMENSION_STEP_MM } from '../../domain/config/productCatalog';
import { getEffectiveLimits } from '../../domain/constraints';
import { findStandardSize, getHandleVariantDefinition, getStandardSizeViolations } from '../../domain/handleVariants';
import type { StandardSize } from '../../domain/config/productCatalog';
import type { Dimensions } from '../../domain/types';
import { validateDimensionValue } from '../../domain/validation/dimensions';
import { useConfigurationStore } from '../../state/configurationStore';
import { DimensionIcon } from './DimensionIcon';
import { InfoTip } from './InfoTip';
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
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const setDimension = useConfigurationStore((s) => s.setDimension);
  const applyStandardSize = useConfigurationStore((s) => s.applyStandardSize);
  const [drafts, setDrafts] = useState<Drafts>({});

  const definition = BAG_TYPES[productType];
  const limits = definition.limits;
  const effective = getEffectiveLimits(dimensions, limits);
  const { standardSizes } = getHandleVariantDefinition(definition, handle);
  const matchedSize = findStandardSize(dimensions, standardSizes);
  const sizeOptions = standardSizes.map((size) => ({ size, violations: getStandardSizeViolations(size, limits) }));
  const unavailableSizes = sizeOptions.filter(({ violations }) => violations.length > 0);
  const sizeSelectId = `${idPrefix}-standardSize`;

  const sizeLabel = ({ dimensions: d, sizeClass }: StandardSize) => {
    const label = t('dimensions.standardSize.option', d);
    return sizeClass
      ? t('dimensions.standardSize.withClass', { size: label, sizeClass: t(`dimensions.standardSize.class.${sizeClass}`) })
      : label;
  };

  const selectStandardSize = (id: string) => {
    if (id && applyStandardSize(id)) setDrafts({});
  };

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
      {standardSizes.length > 0 ? (
        <div className="field field--standard-size">
          <label htmlFor={sizeSelectId}>{t('dimensions.standardSize.label')}</label>
          <select
            id={sizeSelectId}
            value={matchedSize?.id ?? ''}
            aria-describedby={`${sizeSelectId}-hint`}
            onChange={(e) => selectStandardSize(e.target.value)}
          >
            <option value="" disabled={matchedSize !== null}>
              {t('dimensions.standardSize.custom')}
            </option>
            {sizeOptions.map(({ size, violations }) => (
              <option key={size.id} value={size.id} disabled={violations.length > 0}>
                {violations.length > 0
                  ? t('dimensions.standardSize.unavailable', { size: sizeLabel(size) })
                  : sizeLabel(size)}
              </option>
            ))}
          </select>
          <InfoTip id={`${sizeSelectId}-hint`} label={t('common.moreInfo', { field: t('dimensions.standardSize.label') })}>
            {t('dimensions.standardSize.info')}
            {unavailableSizes.length > 0 && (
              <>
                <br />
                {t('dimensions.standardSize.unavailableInfo')}
                {unavailableSizes.map(({ size, violations }) =>
                  violations.map(({ key, value, range }) => (
                    <span key={`${size.id}-${key}`} className="infotip__line">
                      {t('dimensions.standardSize.violation', {
                        size: t('dimensions.standardSize.option', size.dimensions),
                        dimension: t(`dimensions.${key}`),
                        value,
                        min: range.min,
                        max: range.max,
                      })}
                    </span>
                  )),
                )}
              </>
            )}
          </InfoTip>
        </div>
      ) : (
        <p className="note">{t('dimensions.standardSize.none')}</p>
      )}
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
            <InfoTip id={`${id}-hint`} label={t('common.moreInfo', { field: t(`dimensions.${key}`) })}>
              {t('dimensions.range', { min, max })}
              {lock && <> · {lock}</>}
            </InfoTip>
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
