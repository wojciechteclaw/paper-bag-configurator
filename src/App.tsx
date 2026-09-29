import { useTranslation } from 'react-i18next';
import { BagConfigurator } from './ui/components/BagConfigurator';
import { DemoButton } from './ui/components/DemoButton';
import { LanguageSwitcher } from './ui/components/LanguageSwitcher';
import { PreviewPanel } from './ui/components/PreviewPanel';

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t('app.title')}</h1>
        <div className="app-header__actions">
          <DemoButton />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="app-layout">
        <section className="config-panel" aria-label={t('app.configuration')}>
          <BagConfigurator />
        </section>
        <section className="preview-panel" aria-label={t('app.preview')}>
          <PreviewPanel />
        </section>
      </main>
    </div>
  );
}
