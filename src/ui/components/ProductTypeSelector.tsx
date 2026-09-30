import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import type { ProductTypeAdjustment } from '../../domain/productType';
import type { BagType } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

const TYPES = Object.keys(BAG_TYPES) as BagType[];

export function ProductTypeSelector() {
  const { t } = useTranslation();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const configurationId = useConfigurationStore((s) => s.configuration.id);
  const setProductType = useConfigurationStore((s) => s.setProductType);
  // Adjustments of the last switch, shown only while that configuration still has that type (a demo / new
  // configuration or switching back hides them).
  const [last, setLast] = useState<{ id: string; type: BagType; list: ProductTypeAdjustment[] } | null>(null);
  const adjustments = last && last.id === configurationId && last.type === productType ? last.list : [];

  const select = (type: BagType) => setLast({ id: configurationId, type, list: setProductType(type) });

  const describe = (adjustment: ProductTypeAdjustment) => {
    switch (adjustment.field) {
      case 'handle':
        return t('productType.adjusted.handle', { handle: t(`handle.${adjustment.from}`) });
      case 'dimension':
        return t('productType.adjusted.dimension', {
          dimension: t([`dimensions.byType.${productType}.${adjustment.key}`, `dimensions.${adjustment.key}`]),
          from: adjustment.from,
          to: adjustment.to,
        });
      case 'type':
        return t('productType.adjusted.paperType', {
          from: t(`paper.types.${adjustment.from}`),
          to: t(`paper.types.${adjustment.to}`),
        });
      case 'grammage':
        return t('productType.adjusted.grammage', { from: adjustment.from, to: adjustment.to });
      case 'moistureBarrier':
        return t('productType.adjusted.moistureBarrier');
      case 'paperColor':
        return t('productType.adjusted.paperColor', { from: t(`paper.${adjustment.from}`), to: t(`paper.${adjustment.to}`) });
      case 'packaging':
        return t('productType.adjusted.packaging', {
          from: t(`packaging.${adjustment.from}`),
          to: t(`packaging.${adjustment.to}`),
        });
      case 'pantoneColors':
        return t('productType.adjusted.pantoneColors', { removed: adjustment.removed });
      case 'glueFlap':
        return t('productType.adjusted.glueFlap', { from: adjustment.from, to: adjustment.to });
      case 'extendToBottom':
        return t('productType.adjusted.extendToBottom');
    }
  };

  return (
    <fieldset>
      <legend>{t('productType.label')}</legend>
      <div className="choice-group">
        {TYPES.map((type) => {
          const { available } = BAG_TYPES[type];
          return (
            <label key={type} className={available ? 'choice' : 'choice is-disabled'}>
              <input
                type="radio"
                name="productType"
                value={type}
                checked={productType === type}
                disabled={!available}
                onChange={() => select(type)}
              />
              <span>{t(`productType.${type}`)}</span>
              {!available && <span className="badge">{t('productType.comingSoon')}</span>}
            </label>
          );
        })}
      </div>
      <p className="note">{t(`productType.description.${productType}`)}</p>
      <div role="status" aria-live="polite">
        {adjustments.length > 0 && (
          <div className="warning">
            {t('productType.adjusted.intro', { type: t(`productType.${productType}`) })}
            <ul className="adjustment-list">
              {adjustments.map((adjustment, i) => (
                <li key={`${adjustment.field}-${i}`}>{describe(adjustment)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </fieldset>
  );
}
