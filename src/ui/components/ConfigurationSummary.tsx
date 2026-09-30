import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getActiveArtworkTargets, getArtworkLayout, getArtworkSlot, getWrapLayers } from '../../domain/artworkLayout';
import { normalizeColorAnalysis } from '../../domain/printCoverage/colorAnalysis';
import { createNumberFormatter } from '../../i18n/numberFormat';
import { getBagWeight } from '../../domain/bagWeight';
import { useConfigurationStore } from '../../state/configurationStore';
import { ExportActions } from './ExportActions';
import { SaveProjectButton } from './ProjectFileActions';
import { keyForType } from '../../i18n/keyForType';

type CopyStatus = 'copied' | 'copyFailed' | null;

export function ConfigurationSummary() {
  const { t, i18n } = useTranslation();
  const jsonId = useId();
  const configuration = useConfigurationStore((s) => s.configuration);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);

  const { dimensions, paper, handle, print } = configuration;
  const colorAnalysis = normalizeColorAnalysis(print.colorAnalysis);
  const json = JSON.stringify(configuration, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('copyFailed');
    }
  };

  return (
    <>
      <fieldset>
        <legend>{t('summary.label')}</legend>
        <dl className="summary">
          <dt>{t('summary.productType')}</dt>
          <dd>{t(`productType.${configuration.productType}`)}</dd>

          <dt>{t('summary.dimensions')}</dt>
          <dd>{t(keyForType('summary.dimensionsValue', configuration.productType), dimensions)}</dd>

          <dt>{t('summary.paper')}</dt>
          <dd>
            {t(`paper.types.${paper.type}`)}, {t(`paper.${paper.color}`)}, {paper.grammage} {t('paper.grammageUnit')},{' '}
            {t('summary.fsc')}: {t(paper.fscCertified ? 'summary.yes' : 'summary.no')}, {t('summary.moistureBarrier')}:{' '}
            {t(paper.moistureBarrier ? 'summary.yes' : 'summary.no')}
          </dd>

          <dt>{t('paper.weight')}</dt>
          <dd>
            {t('paper.weightValue', {
              grams: createNumberFormatter(i18n.resolvedLanguage ?? i18n.language, { maximumFractionDigits: 1 })(
                getBagWeight(configuration).grams,
              ),
            })}
          </dd>

          <dt>{t('summary.handle')}</dt>
          <dd>{t(handle ? `handle.${handle.type}` : 'handle.none')}</dd>

          <dt>{t('summary.artwork')}</dt>
          <dd>
            {t(`artwork.layout.${getArtworkLayout(configuration)}`)}
            <ul className="summary__list">
              {getArtworkLayout(configuration) === 'WRAP' ? (
                getWrapLayers(configuration).length === 0 ? (
                  <li>{t('artwork.layers.title')}: {t('summary.noArtwork')}</li>
                ) : (
                  getWrapLayers(configuration).map((layer, index) => (
                    <li key={layer.id}>
                      {t('artwork.layers.layerName', { index: index + 1 })}: {layer.artwork.fileName}
                    </li>
                  ))
                )
              ) : (
                getActiveArtworkTargets(configuration).map((target) => (
                  <li key={target}>
                    {t(`artwork.${target}`)}: {getArtworkSlot(configuration, target).artwork?.fileName ?? t('summary.noArtwork')}
                  </li>
                ))
              )}
            </ul>
          </dd>

          <dt>{t('summary.printColors')}</dt>
          <dd>
            {t(`print.${print.technology}`)}:{' '}
            {print.pantoneColors.length > 0 ? print.pantoneColors.map((color) => color.code).join(', ') : t('summary.noPrint')}
          </dd>

          <dt>{t('coverage.analysis.summaryLabel')}</dt>
          <dd>
            {t('coverage.analysis.summaryValue', {
              tolerance: colorAnalysis.mergeTolerance,
              minShare: createNumberFormatter(i18n.resolvedLanguage ?? i18n.language, {
                style: 'percent',
                maximumFractionDigits: 2,
              })(colorAnalysis.minAreaShare),
            })}
          </dd>

          <dt>{t('summary.packaging')}</dt>
          <dd>{t(`packaging.${configuration.packaging}`)}</dd>

        </dl>
      </fieldset>

      <ExportActions configuration={configuration} />

      <fieldset>
        <legend id={jsonId}>{t('summary.json')}</legend>
        <div className="json-actions">
          <button type="button" onClick={() => void copy()}>
            {t('summary.copy')}
          </button>
          <SaveProjectButton />
          <span aria-live="polite" className="note">
            {copyStatus && t(`summary.${copyStatus}`)}
          </span>
        </div>
        <p className="note">{t('project.summaryNote')}</p>
        <pre className="json-view" tabIndex={0} aria-labelledby={jsonId}>
          <code>{json}</code>
        </pre>
      </fieldset>
    </>
  );
}
