import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import {
  getHandleVariant,
  getHandleVariantDefinition,
  getSupportedHandleTypes,
  type PaperAdjustment,
} from '../../domain/handleVariants';
import type { HandleVariant } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

/**
 * Handle variant as the first choice of step 2 (cards). Switching the variant constrains the paper into the
 * variant's options in the store; whatever had to change is announced below the cards.
 */
export function HandleConfigurator() {
  const { t } = useTranslation();
  const idPrefix = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const setHandle = useConfigurationStore((s) => s.setHandle);
  const [adjustments, setAdjustments] = useState<PaperAdjustment[]>([]);

  const definition = BAG_TYPES[productType];
  const current = getHandleVariant(handle);
  const { grammage } = getHandleVariantDefinition(definition, handle);

  const select = (variant: HandleVariant) => {
    if (variant === current) return;
    setAdjustments(setHandle(variant === 'NONE' ? null : variant));
  };

  const describe = (adjustment: PaperAdjustment) => {
    switch (adjustment.field) {
      case 'type':
        return t('handle.adjusted.type', {
          from: t(`paper.types.${adjustment.from}`),
          to: t(`paper.types.${adjustment.to}`),
        });
      case 'grammage':
        return t('handle.adjusted.grammage', {
          from: adjustment.from,
          to: adjustment.to,
          min: grammage.min,
          max: grammage.max,
        });
      case 'moistureBarrier':
        return t('handle.adjusted.moistureBarrier');
    }
  };

  return (
    <fieldset>
      <legend>{t('handle.label')}</legend>
      <div className="variant-cards">
        {definition.handleVariants.map(({ variant, capacityLitres }) => {
          const id = `${idPrefix}-${variant}`;
          const checked = variant === current;
          return (
            <label key={variant} className={checked ? 'variant-card is-selected' : 'variant-card'}>
              <input
                type="radio"
                name={`${idPrefix}-handleVariant`}
                value={variant}
                checked={checked}
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-description`}
                onChange={() => select(variant)}
              />
              <span id={`${id}-title`} className="variant-card__title">
                {t(variant === 'NONE' ? 'handle.none' : `handle.${variant}`)}
              </span>
              <span id={`${id}-description`} className="variant-card__description">
                {t([`handle.byType.${productType}.description.${variant}`, `handle.description.${variant}`])}
                {capacityLitres && <> {t('handle.capacity', capacityLitres)}</>}
              </span>
            </label>
          );
        })}
      </div>
      {current !== 'NONE' && <p className="note">{t('handle.placementNote')}</p>}
      {getSupportedHandleTypes(definition).length === 0 && <p className="note">{t('handle.noneAvailable')}</p>}
      <div role="status" aria-live="polite">
        {adjustments.length > 0 && (
          <div className="warning">
            {t('handle.adjusted.intro')}
            <ul className="adjustment-list">
              {adjustments.map((adjustment) => (
                <li key={adjustment.field}>{describe(adjustment)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </fieldset>
  );
}
