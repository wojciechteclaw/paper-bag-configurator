import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATOR_STEPS, useConfiguratorUiStore, type ConfiguratorStep } from '../../state/configuratorUiStore';
import { ArtworkConfigurator } from './ArtworkConfigurator';
import { ConfigurationSummary } from './ConfigurationSummary';
import { DimensionsForm } from './DimensionsForm';
import { HandleConfigurator } from './HandleConfigurator';
import { PaperConfigurator } from './PaperConfigurator';
import { ProductTypeSelector } from './ProductTypeSelector';
import { ProductionOptions } from './ProductionOptions';

const STEP_CONTENT: Record<ConfiguratorStep, () => ReactNode> = {
  typeAndDimensions: () => (
    <>
      <ProductTypeSelector />
      <DimensionsForm />
    </>
  ),
  paperAndHandle: () => (
    <>
      <HandleConfigurator />
      <PaperConfigurator />
    </>
  ),
  artwork: () => <ArtworkConfigurator />,
  production: () => <ProductionOptions />,
  summary: () => <ConfigurationSummary />,
};

/** Step-by-step configurator; steps are freely navigable and the current step is view state only. */
export function BagConfigurator() {
  const { t } = useTranslation();
  const step = useConfiguratorUiStore((s) => s.step);
  const setStep = useConfiguratorUiStore((s) => s.setStep);
  const nextStep = useConfiguratorUiStore((s) => s.nextStep);
  const previousStep = useConfiguratorUiStore((s) => s.previousStep);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the new step's heading only after user navigation, never on first render.
  const focusPending = useRef(false);

  const index = CONFIGURATOR_STEPS.indexOf(step);
  const isFirst = index === 0;
  const isLast = index === CONFIGURATOR_STEPS.length - 1;

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    headingRef.current?.focus();
  }, [step]);

  const navigate = (action: () => void) => {
    focusPending.current = true;
    action();
  };

  return (
    <div className="configurator">
      <nav aria-label={t('steps.navLabel')}>
        <ol className="stepper">
          {CONFIGURATOR_STEPS.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className={i < index ? 'stepper__step is-done' : 'stepper__step'}
                aria-current={id === step ? 'step' : undefined}
                onClick={() => navigate(() => setStep(id))}
              >
                <span className="stepper__index" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="stepper__label">{t(`steps.${id}`)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="configurator__step" aria-labelledby="configurator-step-title">
        <h2 id="configurator-step-title" ref={headingRef} tabIndex={-1}>
          <small>{t('steps.position', { current: index + 1, total: CONFIGURATOR_STEPS.length })}</small>
          {t(`steps.${step}`)}
        </h2>
        {STEP_CONTENT[step]()}
      </section>

      <div className="configurator__nav">
        <button type="button" onClick={() => navigate(previousStep)} disabled={isFirst}>
          ← {t('steps.back')}
        </button>
        <button type="button" className="primary" onClick={() => navigate(nextStep)} disabled={isLast}>
          {t('steps.next')} →
        </button>
      </div>
    </div>
  );
}
