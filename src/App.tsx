import { useTranslation } from 'react-i18next';
import { BagPreview3D } from './renderer/BagPreview3D';
import { useConfigurationStore } from './state/configurationStore';
import { DimensionsForm } from './ui/components/DimensionsForm';
import { LanguageSwitcher } from './ui/components/LanguageSwitcher';

// TODO(principal-software-engineer): ProductTypeSelector, HandleConfigurator, ArtworkConfigurator.
export default function App() {
  const { t } = useTranslation();
  const configuration = useConfigurationStore((s) => s.configuration);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('app.title')}</h1>
        <LanguageSwitcher />
      </header>
      <main className="app-layout">
        <section className="config-panel" aria-label={t('app.configuration')}>
          <DimensionsForm />
        </section>
        <section className="preview-panel" aria-label={t('app.preview')}>
          <BagPreview3D configuration={configuration} />
        </section>
      </main>
    </div>
  );
}
