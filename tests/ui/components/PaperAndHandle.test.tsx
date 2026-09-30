import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { useConfiguratorUiStore } from '../../../src/state/configuratorUiStore';
import { BagConfigurator } from '../../../src/ui/components/BagConfigurator';

const paper = () => useConfigurationStore.getState().configuration.paper;
const grammageSelect = () => screen.getByLabelText('Gramatura') as HTMLSelectElement;
const optionValues = (select: HTMLSelectElement) => Array.from(select.options).map((o) => Number(o.value));

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  useConfiguratorUiStore.setState({ step: 'paperAndHandle' });
});

describe('Step 2 — paper and handle', () => {
  it('shows the handle variant cards first, each with a description', () => {
    render(<BagConfigurator />);
    const legends = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    expect(legends.slice(0, 2)).toEqual(['Uchwyt', 'Papier']);

    const none = screen.getByRole('radio', { name: 'Bez uchwytu' });
    expect(none).toBeChecked();
    expect(none).toHaveAccessibleDescription(/bariera na wilgoć/);
    expect(screen.getByRole('radio', { name: 'Wewnętrzny, papier płaski' })).toHaveAccessibleDescription(
      /Pojemność 3–40 l/,
    );
    expect(screen.getByRole('radio', { name: 'Wewnętrzny, papier skręcany' })).toHaveAccessibleDescription(
      /Pojemność 3–30 l/,
    );
  });

  it('offers all paper types, 50–120 g/m² and a moisture barrier without a handle', () => {
    render(<BagConfigurator />);
    const types = within(screen.getByRole('radiogroup', { name: 'Rodzaj papieru' })).getAllByRole('radio');
    expect(types.map((r) => r.getAttribute('value'))).toEqual(['KRAFT', 'RECYCLED', 'COATED', 'FILM_COATED', 'GREASEPROOF']);
    expect(optionValues(grammageSelect())).toEqual([50, 60, 70, 80, 90, 100, 110, 120]);
    expect(grammageSelect()).toHaveAccessibleDescription('Zakres dla wybranego uchwytu: 50–120 g/m², co 10 g/m²');
    expect(screen.getByLabelText('Certyfikat FSC®')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('Bariera na wilgoć'));
    fireEvent.click(screen.getByLabelText('Tłuszczoszczelny'));
    fireEvent.click(screen.getByLabelText('Biały'));
    fireEvent.change(grammageSelect(), { target: { value: '120' } });
    expect(paper()).toMatchObject({ type: 'GREASEPROOF', color: 'WHITE', grammage: 120, moistureBarrier: true });
  });

  it('narrows the options for a flat handle and hides the moisture barrier', () => {
    render(<BagConfigurator />);
    fireEvent.click(screen.getByRole('radio', { name: 'Wewnętrzny, papier płaski' }));
    const types = within(screen.getByRole('radiogroup', { name: 'Rodzaj papieru' })).getAllByRole('radio');
    expect(types.map((r) => r.getAttribute('value'))).toEqual(['KRAFT', 'RECYCLED']);
    expect(optionValues(grammageSelect())).toEqual([70, 80, 90, 100, 110]);
    expect(screen.queryByLabelText('Bariera na wilgoć')).not.toBeInTheDocument();
    expect(screen.getByText(/przyklejane od wewnątrz/)).toBeInTheDocument();
    // Default paper already fits → nothing to announce.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('tells the user what was adjusted when switching the handle variant', () => {
    render(<BagConfigurator />);
    fireEvent.click(screen.getByLabelText('Kredowany'));
    fireEvent.change(grammageSelect(), { target: { value: '50' } });
    fireEvent.click(screen.getByLabelText('Bariera na wilgoć'));

    fireEvent.click(screen.getByRole('radio', { name: 'Wewnętrzny, papier skręcany' }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Dostosowano papier do wybranego uchwytu');
    expect(status).toHaveTextContent('rodzaj papieru: Kredowany → Kraft');
    expect(status).toHaveTextContent('gramatura: 50 → 70 g/m² (dostępny zakres 70–120 g/m²)');
    expect(status).toHaveTextContent('wyłączono barierę na wilgoć');
    expect(paper()).toMatchObject({ type: 'KRAFT', grammage: 70, moistureBarrier: false });
    expect(screen.getByLabelText('Kraft')).toBeChecked();
    expect(grammageSelect().value).toBe('70');

    // A switch that needs no adjustment clears the notice.
    fireEvent.click(screen.getByRole('radio', { name: 'Bez uchwytu' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('is translated to English', async () => {
    await act(() => i18n.changeLanguage('en'));
    render(<BagConfigurator />);
    expect(screen.getByRole('radio', { name: 'No handle' })).toBeChecked();
    expect(screen.getByLabelText('Film-coated')).toBeInTheDocument();
    expect(screen.getByLabelText('Moisture barrier')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Greaseproof'));
    fireEvent.click(screen.getByRole('radio', { name: 'Internal, flat paper' }));
    expect(screen.getByRole('status')).toHaveTextContent('paper type: Greaseproof → Kraft');
  });
});
