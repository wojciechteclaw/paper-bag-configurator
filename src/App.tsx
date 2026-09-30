import { useTranslation } from 'react-i18next';
import { AppHeader } from './ui/components/AppHeader';
import { BagConfigurator } from './ui/components/BagConfigurator';
import { PreviewPanel } from './ui/components/PreviewPanel';

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      <AppHeader />
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
