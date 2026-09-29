import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import { useConfigurationStore } from '../../state/configurationStore';

export function PaperConfigurator() {
  const { t } = useTranslation();
  const grammageId = useId();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const paper = useConfigurationStore((s) => s.configuration.paper);
  const setPaperColor = useConfigurationStore((s) => s.setPaperColor);
  const setGrammage = useConfigurationStore((s) => s.setGrammage);
  const setFscCertified = useConfigurationStore((s) => s.setFscCertified);

  const { paperColors, grammage } = BAG_TYPES[productType];
  const grammages: number[] = [];
  for (let g = grammage.min; g <= grammage.max; g += grammage.step) grammages.push(g);

  return (
    <fieldset>
      <legend>{t('paper.label')}</legend>

      <div role="radiogroup" aria-label={t('paper.color')} className="choice-group choice-group--inline">
        {paperColors.map((color) => (
          <label key={color} className="choice">
            <input
              type="radio"
              name="paperColor"
              value={color}
              checked={paper.color === color}
              onChange={() => setPaperColor(color)}
            />
            <span className={`swatch swatch--${color.toLowerCase()}`} aria-hidden="true" />
            <span>{t(`paper.${color}`)}</span>
          </label>
        ))}
      </div>

      <div className="field">
        <label htmlFor={grammageId}>{t('paper.grammage')}</label>
        <select id={grammageId} value={paper.grammage} onChange={(e) => setGrammage(Number(e.target.value))}>
          {grammages.map((g) => (
            <option key={g} value={g}>
              {g} {t('paper.grammageUnit')}
            </option>
          ))}
        </select>
      </div>

      <label className="choice">
        <input type="checkbox" checked={paper.fscCertified} onChange={(e) => setFscCertified(e.target.checked)} />
        <span>{t('paper.fsc')}</span>
      </label>
    </fieldset>
  );
}
