import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DEMO_COUNT } from '../demo/demoConfiguration';
import { DemoButton } from './DemoButton';
import { HeaderMenu } from './HeaderMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ProjectFileActions } from './ProjectFileActions';

/**
 * Top bar. Desktop: title, project buttons, Demo 1…N and the language switcher in one row. Narrow screens (≤ 900 px):
 * title, language switcher and a ☰ menu with the project actions and the demos with their descriptions (client [K]
 * 30.09.2026: "menu nawigacyjne … albo jakiś plik rozwijany demo").
 */
export function AppHeader() {
  const { t } = useTranslation();
  const idBase = useId();
  const projectHeadingId = `${idBase}-project`;
  const demosHeadingId = `${idBase}-demos`;

  return (
    <header className="app-header">
      <h1>{t('app.title')}</h1>
      <HeaderMenu label={t('app.menu')}>
        <section className="header-menu__section" aria-labelledby={projectHeadingId}>
          <h2 id={projectHeadingId} className="header-menu__heading">
            {t('app.menuProject')}
          </h2>
          <ProjectFileActions />
        </section>
        <section className="header-menu__section" aria-labelledby={demosHeadingId}>
          <h2 id={demosHeadingId} className="header-menu__heading">
            {t('app.menuDemos')}
          </h2>
          <ul className="demo-list">
            {Array.from({ length: DEMO_COUNT }, (_, i) => (
              <li key={i + 1}>
                <DemoButton index={i + 1} />
              </li>
            ))}
          </ul>
        </section>
      </HeaderMenu>
      <LanguageSwitcher />
    </header>
  );
}
