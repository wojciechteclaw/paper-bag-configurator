import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PANEL_POSITIONS } from '../../domain/factories';
import { normalizeColorAnalysis } from '../../domain/printCoverage/colorAnalysis';
import { useConfigurationStore } from '../../state/configurationStore';
import { ExportActions } from './ExportActions';

type CopyStatus = 'copied' | 'copyFailed' | null;

export function ConfigurationSummary() {
  const { t, i18n } = useTranslation();
  const jsonId = useId();
  const configuration = useConfigurationStore((s) => s.configuration);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);

  const { dimensions, paper, handle, panels, print } = configuration;
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

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bag-configuration-${configuration.id.slice(0, 8)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <fieldset>
        <legend>{t('summary.label')}</legend>
        <dl className="summary">
          <dt>{t('summary.productType')}</dt>
          <dd>{t(`productType.${configuration.productType}`)}</dd>

          <dt>{t('summary.dimensions')}</dt>
          <dd>{t('summary.dimensionsValue', dimensions)}</dd>

          <dt>{t('summary.paper')}</dt>
          <dd>
            {t(`paper.types.${paper.type}`)}, {t(`paper.${paper.color}`)}, {paper.grammage} {t('paper.grammageUnit')},{' '}
            {t('summary.fsc')}: {t(paper.fscCertified ? 'summary.yes' : 'summary.no')}, {t('summary.moistureBarrier')}:{' '}
            {t(paper.moistureBarrier ? 'summary.yes' : 'summary.no')}
          </dd>

          <dt>{t('summary.handle')}</dt>
          <dd>{t(handle ? `handle.${handle.type}` : 'handle.none')}</dd>

          <dt>{t('summary.artwork')}</dt>
          <dd>
            <ul className="summary__list">
              {PANEL_POSITIONS.map((position) => (
                <li key={position}>
                  {t(`artwork.${position}`)}: {panels[position].artwork?.fileName ?? t('summary.noArtwork')}
                </li>
              ))}
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
              minShare: new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
                style: 'percent',
                maximumFractionDigits: 2,
              }).format(colorAnalysis.minAreaShare),
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
          <button type="button" onClick={download}>
            {t('summary.download')}
          </button>
          <span aria-live="polite" className="note">
            {copyStatus && t(`summary.${copyStatus}`)}
          </span>
        </div>
        <pre className="json-view" tabIndex={0} aria-labelledby={jsonId}>
          <code>{json}</code>
        </pre>
      </fieldset>
    </>
  );
}
