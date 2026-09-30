import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { getBagWeight } from '../../domain/bagWeight';
import { BAG_TYPES } from '../../domain/config/productCatalog';
import { getHandleVariantDefinition } from '../../domain/handleVariants';
import { createNumberFormatter } from '../../i18n/numberFormat';
import { useConfigurationStore } from '../../state/configurationStore';
import { InfoTip } from './InfoTip';

/** Paper options; types, grammage range and moisture barrier come from the current handle variant. */
export function PaperConfigurator() {
  const { t, i18n } = useTranslation();
  const idPrefix = useId();
  const grammageId = `${idPrefix}-grammage`;
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const handle = useConfigurationStore((s) => s.configuration.handle);
  const paper = useConfigurationStore((s) => s.configuration.paper);
  const dimensions = useConfigurationStore((s) => s.configuration.dimensions);
  const setPaperType = useConfigurationStore((s) => s.setPaperType);
  const setPaperColor = useConfigurationStore((s) => s.setPaperColor);
  const setGrammage = useConfigurationStore((s) => s.setGrammage);
  const setFscCertified = useConfigurationStore((s) => s.setFscCertified);
  const setMoistureBarrier = useConfigurationStore((s) => s.setMoistureBarrier);

  const definition = BAG_TYPES[productType];
  const { paperTypes, grammage, moistureBarrierAvailable } = getHandleVariantDefinition(definition, handle);
  const grammages: number[] = [];
  for (let g = grammage.min; g <= grammage.max; g += grammage.step) grammages.push(g);
  const weight = getBagWeight({ dimensions, paper, productType });
  const language = i18n.resolvedLanguage ?? i18n.language;
  const formatGrams = createNumberFormatter(language, { maximumFractionDigits: 1 });
  const formatArea = createNumberFormatter(language, { maximumFractionDigits: 3 });

  return (
    <fieldset>
      <legend>{t('paper.label')}</legend>

      <h3 id={`${idPrefix}-type`} className="subheading">
        {t('paper.type')}
      </h3>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-type`} className="choice-group choice-group--inline">
        {paperTypes.map((type) => (
          <label key={type} className="choice">
            <input
              type="radio"
              name={`${idPrefix}-paperType`}
              value={type}
              checked={paper.type === type}
              onChange={() => setPaperType(type)}
            />
            <span>{t(`paper.types.${type}`)}</span>
          </label>
        ))}
      </div>

      <h3 id={`${idPrefix}-color`} className="subheading">
        {t('paper.color')}
      </h3>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-color`} className="choice-group choice-group--inline">
        {definition.paperColors.map((color) => (
          <label key={color} className="choice">
            <input
              type="radio"
              name={`${idPrefix}-paperColor`}
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
        <select
          id={grammageId}
          value={paper.grammage}
          aria-describedby={`${grammageId}-hint`}
          onChange={(e) => setGrammage(Number(e.target.value))}
        >
          {grammages.map((g) => (
            <option key={g} value={g}>
              {g} {t('paper.grammageUnit')}
            </option>
          ))}
        </select>
        <InfoTip id={`${grammageId}-hint`} label={t('common.moreInfo', { field: t('paper.grammage') })}>
          {t('paper.grammageRange', { min: grammage.min, max: grammage.max, step: grammage.step })}
        </InfoTip>
      </div>

      <p className="paper-weight">
        {t('paper.weight')}: <strong>{t('paper.weightValue', { grams: formatGrams(weight.grams) })}</strong>
        <br />
        <small>{t('paper.weightNote', { area: formatArea(weight.blankAreaM2) })}</small>
      </p>

      <label className="choice">
        <input type="checkbox" checked={paper.fscCertified} onChange={(e) => setFscCertified(e.target.checked)} />
        <span>{t('paper.fsc')}</span>
      </label>

      {moistureBarrierAvailable && (
        <label className="choice">
          <input
            type="checkbox"
            checked={paper.moistureBarrier}
            onChange={(e) => setMoistureBarrier(e.target.checked)}
          />
          <span>{t('paper.moistureBarrier')}</span>
        </label>
      )}
    </fieldset>
  );
}
