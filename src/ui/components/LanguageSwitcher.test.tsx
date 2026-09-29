import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n, { LANGUAGE_STORAGE_KEY, readStoredLanguage } from '../../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

function Title() {
  const { t } = useTranslation();
  return <h1>{t('productType.BLOCK')}</h1>;
}

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  localStorage.clear();
});

describe('LanguageSwitcher', () => {
  it('offers PL, EN and DE with PL selected by default', () => {
    render(<LanguageSwitcher />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['PL', 'EN', 'DE']);
    expect(screen.getByRole('button', { name: 'PL' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches the UI to German, updates <html lang> and remembers the choice', async () => {
    render(
      <>
        <LanguageSwitcher />
        <Title />
      </>,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('Torba klockowa');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'DE' })));

    expect(screen.getByRole('heading')).toHaveTextContent('Blockbodenbeutel');
    expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'PL' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.lang).toBe('de');
    expect(document.title).toBe('Beutel-Konfigurator');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('de');
    expect(readStoredLanguage()).toBe('de');
  });

  it('falls back to Polish for an unknown stored language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(readStoredLanguage()).toBe('pl');
  });
});
