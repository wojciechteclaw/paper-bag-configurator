import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import type { HandleType } from '../../domain/types';
import { useConfigurationStore } from '../../state/configurationStore';

export function HandleConfigurator() {
  const { t } = useTranslation();
  const noteId = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const setHandle = useConfigurationStore((s) => s.setHandle);

  const options: (HandleType | null)[] = [null, ...BAG_TYPES[productType].supportedHandles];

  return (
    <fieldset aria-describedby={noteId}>
      <legend>{t('handle.label')}</legend>
      <div className="choice-group">
        {options.map((type) => (
          <label key={type ?? 'none'} className="choice">
            <input
              type="radio"
              name="handle"
              value={type ?? 'none'}
              checked={(handle?.type ?? null) === type}
              onChange={() => setHandle(type)}
            />
            <span>{t(type ? `handle.${type}` : 'handle.none')}</span>
          </label>
        ))}
      </div>
      <p id={noteId} className="note">
        {t('handle.placementNote')}
      </p>
    </fieldset>
  );
}
