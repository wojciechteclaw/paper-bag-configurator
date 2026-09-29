import { useTranslation } from 'react-i18next';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import type { BagType } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

const TYPES = Object.keys(BAG_TYPES) as BagType[];

export function ProductTypeSelector() {
  const { t } = useTranslation();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const setProductType = useConfigurationStore((s) => s.setProductType);

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
                onChange={() => setProductType(type)}
              />
              <span>{t(`productType.${type}`)}</span>
              {!available && <span className="badge">{t('productType.comingSoon')}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
