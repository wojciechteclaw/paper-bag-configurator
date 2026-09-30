import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { useConfiguratorUiStore } from '../../../src/state/configuratorUiStore';
import { BagConfigurator } from '../../../src/ui/components/BagConfigurator';

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  useConfiguratorUiStore.setState({ step: 'typeAndDimensions' });
});

const stepButton = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const heading = () => screen.getByRole('heading', { level: 2 });

describe('BagConfigurator step navigation', () => {
  it('marks the list item of the current step (phones show only its label) and keeps every label accessible', () => {
    const { container } = render(<BagConfigurator />);
    const current = () => [...container.querySelectorAll('.stepper li.is-current')];
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveTextContent('Typ i wymiary');
    fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveTextContent('Papier i uchwyt');
    // Labels of the other steps are only hidden visually (CSS), so the buttons keep their names.
    expect(stepButton('Podsumowanie')).toBeInTheDocument();
  });

  it('starts on step 1 with the type selector and dimensions', () => {
    render(<BagConfigurator />);
    expect(heading()).toHaveTextContent('Krok 1 z 5');
    expect(heading()).toHaveTextContent('Typ i wymiary');
    expect(stepButton('Typ i wymiary')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('Torba klockowa')).toBeChecked();
    expect(screen.getByLabelText(/Torba fałdowa/)).toBeEnabled();
    expect(screen.getByLabelText('Szerokość')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wstecz/ })).toBeDisabled();
  });

  it('switches to the gusseted bag and explains what had to be adjusted', () => {
    render(<BagConfigurator />);
    fireEvent.click(screen.getByLabelText(/Torba fałdowa/));
    const { configuration } = useConfigurationStore.getState();
    expect(configuration.productType).toBe('FOLDED');
    // 200 × 400 × 150 fits the gusseted ranges (gusset ≤ width); only the grammage has to change.
    expect(configuration.dimensions).toEqual({ width: 200, height: 400, depth: 150 });
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('gramatura: 80 → 60 g/m²');
    // The depth field is the gusset ("Fałda"); the block-bottom depth wording is gone.
    expect(screen.getByLabelText('Fałda')).toHaveValue(150);
    expect(screen.queryByLabelText('Głębokość')).not.toBeInTheDocument();
    // 150 > 0.7 × 200: outside the recommended gusset 80–140 mm [K] — a warning, not an error.
    expect(screen.getByText(/Fałda poza zalecanym zakresem 80–140 mm/)).toBeInTheDocument();
    fireEvent.click(stepButton('Papier i uchwyt'));
    expect(screen.getAllByRole('radio', { name: /uchwyt/i })).toHaveLength(1);
    expect(screen.getByText('Ten typ torby jest produkowany bez uchwytów.')).toBeInTheDocument();

    // The summary writes the size in the client notation W + F × H.
    fireEvent.click(stepButton('Podsumowanie'));
    expect(screen.getByText('200 + 150 × 400 mm')).toBeInTheDocument();
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
