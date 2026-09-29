import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../domain/factories';
import i18n from '../../i18n';
import { useConfigurationStore } from '../../state/configurationStore';
import { ProductionOptions } from './ProductionOptions';

const config = () => useConfigurationStore.getState().configuration;

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
});

describe('ProductionOptions', () => {
  it('adds and removes Pantone colours', () => {
    render(<ProductionOptions />);
    const input = screen.getByLabelText('Kod Pantone');
    fireEvent.change(input, { target: { value: 'PMS 186 C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(config().print.pantoneColors).toEqual(['PMS 186 C']);
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'pms 186 c' } });
    fireEvent.submit(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Ten kolor jest już na liście.');

    fireEvent.click(screen.getByRole('button', { name: 'Usuń PMS 186 C' }));
    expect(config().print.pantoneColors).toEqual([]);
  });

  it('disables adding once the catalog maximum is reached', () => {
    for (let i = 0; i < 8; i++) useConfigurationStore.getState().addPantoneColor(`PMS ${i} C`);
    render(<ProductionOptions />);
    expect(screen.getByLabelText('Kod Pantone')).toBeDisabled();
    expect(screen.getByText('Osiągnięto limit 8 kolorów.')).toBeInTheDocument();
  });

  it('selects packaging', () => {
    render(<ProductionOptions />);
    fireEvent.click(screen.getByLabelText('Folia'));
    expect(config().packaging).toBe('FOIL');
  });

  it('does not commit a quantity below the minimum and clamps it on blur', () => {
    render(<ProductionOptions />);
    const input = screen.getByLabelText('Nakład', { selector: 'input' });
    fireEvent.change(input, { target: { value: '500' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(config().quantity).toBe(30_000);
    fireEvent.blur(input);
    expect(config().quantity).toBe(30_000);

    fireEvent.change(input, { target: { value: '45000' } });
    expect(config().quantity).toBe(45_000);
  });
});
