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
    expect(config().print.pantoneColors).toEqual([{ code: 'PMS 186 C', hex: '#c8102e' }]);
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'pms 186 c' } });
    fireEvent.submit(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Ten kolor jest już na liście.');

    fireEvent.click(screen.getByRole('button', { name: 'Usuń PMS 186 C' }));
    expect(config().print.pantoneColors).toEqual([]);
  });

  it('edits the preview colour of a Pantone entry', () => {
    useConfigurationStore.getState().addPantoneColor('PMS 186 C');
    render(<ProductionOptions />);
    const picker = screen.getByLabelText('Kolor podglądu PMS 186 C');
    expect(picker).toHaveValue('#c8102e');
    fireEvent.change(picker, { target: { value: '#112233' } });
    expect(config().print.pantoneColors[0].hex).toBe('#112233');
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

  it('has no quantity input (removed from the configuration)', () => {
    render(<ProductionOptions />);
    expect(screen.queryByText('Nakład')).not.toBeInTheDocument();
    expect('quantity' in config()).toBe(false);
  });
});
