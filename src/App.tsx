import { useTranslation } from 'react-i18next';
import { BagConfigurator } from './ui/components/BagConfigurator';
import { DemoButton } from './ui/components/DemoButton';
import { DEMO_COUNT } from './ui/demo/demoConfiguration';
import { LanguageSwitcher } from './ui/components/LanguageSwitcher';
import { PreviewPanel } from './ui/components/PreviewPanel';
import { ProjectFileActions } from './ui/components/ProjectFileActions';

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      {/* Narrow screens: title + language on the first row, the project and demo buttons in a scrollable row below. */}
      <header className="app-header">
        <h1>{t('app.title')}</h1>
        <div className="app-header__actions">
          <ProjectFileActions />
          {Array.from({ length: DEMO_COUNT }, (_, i) => (
            <DemoButton key={i + 1} index={i + 1} />
          ))}
        </div>
        <LanguageSwitcher />
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
