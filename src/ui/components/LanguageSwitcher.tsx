import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="lang-switcher">
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button key={lng} aria-pressed={i18n.resolvedLanguage === lng} onClick={() => void i18n.changeLanguage(lng)}>
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
