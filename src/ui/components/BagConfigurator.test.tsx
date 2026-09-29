import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../domain/factories';
import i18n from '../../i18n';
import { useConfigurationStore } from '../../state/configurationStore';
import { useConfiguratorUiStore } from '../../state/configuratorUiStore';
import { BagConfigurator } from './BagConfigurator';

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  useConfiguratorUiStore.setState({ step: 'typeAndDimensions' });
});

const stepButton = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const heading = () => screen.getByRole('heading', { level: 2 });

describe('BagConfigurator step navigation', () => {
  it('starts on step 1 with the type selector and dimensions', () => {
    render(<BagConfigurator />);
    expect(heading()).toHaveTextContent('Krok 1 z 5');
    expect(heading()).toHaveTextContent('Typ i wymiary');
    expect(stepButton('Typ i wymiary')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('Torba klockowa')).toBeChecked();
    expect(screen.getByLabelText(/Torba fałdowa/)).toBeDisabled();
    expect(screen.getByLabelText('Szerokość')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wstecz/ })).toBeDisabled();
  });

  it('moves with Next / Back and updates aria-current', () => {
    render(<BagConfigurator />);
    fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
    expect(heading()).toHaveTextContent('Papier i uchwyt');
    expect(stepButton('Papier i uchwyt')).toHaveAttribute('aria-current', 'step');
    expect(stepButton('Typ i wymiary')).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('Gramatura')).toBeInTheDocument();
    expect(screen.getByLabelText('Bez uchwytu')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Wstecz/ }));
    expect(heading()).toHaveTextContent('Typ i wymiary');
  });

  it('allows jumping freely between steps via the step headers', () => {
    render(<BagConfigurator />);
    fireEvent.click(stepButton('Podsumowanie'));
    expect(heading()).toHaveTextContent('Krok 5 z 5');
    expect(screen.getByRole('button', { name: /Dalej/ })).toBeDisabled();
    expect(screen.getByText(/"productType": "BLOCK"/)).toBeInTheDocument();

    fireEvent.click(stepButton('Grafiki'));
    expect(screen.getByRole('button', { name: 'Ścianka Przednia: dodaj grafikę' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /dodaj grafikę/ })).toHaveLength(4);
  });

  it('moves focus to the step heading after navigation', () => {
    render(<BagConfigurator />);
    fireEvent.click(stepButton('Nadruk i produkcja'));
    expect(heading()).toHaveFocus();
  });

  it('keeps configuration changes when switching steps', () => {
    render(<BagConfigurator />);
    fireEvent.click(stepButton('Papier i uchwyt'));
    fireEvent.click(screen.getByLabelText('Wewnętrzny, papier skręcany'));
    fireEvent.click(stepButton('Typ i wymiary'));
    fireEvent.click(stepButton('Papier i uchwyt'));
    expect(screen.getByLabelText('Wewnętrzny, papier skręcany')).toBeChecked();
    expect(useConfigurationStore.getState().configuration.handle?.type).toBe('TWISTED_PAPER');
  });

  it('does not store the current step in the configuration', () => {
    render(<BagConfigurator />);
    const before = useConfigurationStore.getState().configuration;
    fireEvent.click(stepButton('Grafiki'));
    expect(useConfigurationStore.getState().configuration).toBe(before);
  });
});
