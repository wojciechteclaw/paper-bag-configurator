import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { BagConfigurator } from '../../../src/ui/components/BagConfigurator';
import { WindowConfigurator } from '../../../src/ui/components/WindowConfigurator';

const bagWindow = () => useConfigurationStore.getState().configuration.window;

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('FOLDED') });
});

describe('WindowConfigurator', () => {
  it('is not shown for the block-bottom bag', () => {
    useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
    const { container } = render(<WindowConfigurator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is part of step 1 of the gusseted bag, below the dimensions', () => {
    render(<BagConfigurator />);
    expect(screen.getByRole('group', { name: 'Okienko' })).toBeInTheDocument();
  });

  it('adds a panoramic window, changes the film and removes it again', () => {
    render(<WindowConfigurator />);
    expect(screen.getByRole('radio', { name: 'bez okienka' })).toBeChecked();
    expect(screen.queryByLabelText('Folia')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Panoramiczne (pasek)' }));
    expect(bagWindow()).toMatchObject({ type: 'PANORAMIC', width: 40 });
    // Panoramic: width and overlap only; the derived strip is described.
    expect(screen.getByLabelText('Szerokość otworu')).toHaveValue(40);
    expect(screen.queryByLabelText('Wysokość otworu')).toBeNull();
    expect(screen.getByTestId('window-geometry')).toHaveTextContent('Otwór 40 × 330 mm od 40 mm nad dnem do wylotu');

    fireEvent.change(screen.getByLabelText('Folia'), { target: { value: 'CELLULOSE' } });
    expect(bagWindow()?.material).toBe('CELLULOSE');

    fireEvent.click(screen.getByRole('radio', { name: 'bez okienka' }));
    expect(bagWindow()).toBeNull();
  });

  it('edits the rectangle with drafts: invalid values show an error and are constrained on blur', () => {
    render(<WindowConfigurator />);
    fireEvent.click(screen.getByRole('radio', { name: 'Prostokątne' }));
    const height = screen.getByLabelText('Wysokość otworu') as HTMLInputElement;
    const bottom = screen.getByLabelText('Odległość od dna') as HTMLInputElement;
    expect([height.value, bottom.value]).toEqual(['110', '145']);

    // Valid draft → committed at once.
    fireEvent.change(height, { target: { value: '120' } });
    expect(bagWindow()).toMatchObject({ height: 120 });

    // Invalid draft → error, nothing stored until blur, then clamped.
    fireEvent.change(bottom, { target: { value: '10' } });
    expect(screen.getByText('Minimum: 40 mm')).toBeInTheDocument();
    expect(bottom).toHaveAttribute('aria-invalid', 'true');
    expect(bagWindow()).toMatchObject({ bottomOffset: 145 });
    act(() => {
      fireEvent.blur(bottom);
    });
    expect(bagWindow()).toMatchObject({ bottomOffset: 40 });
    expect(bottom.value).toBe('40');

    // A larger film overlap needs more paper: the width shrinks into the new limit.
    const width = screen.getByLabelText('Szerokość otworu') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '110' } });
    fireEvent.change(screen.getByLabelText('Wsunięcie folii pod papier'), { target: { value: '20' } });
    expect(bagWindow()).toMatchObject({ filmOverlap: 20, width: 90 });
  });

  it('warns about a very large opening', () => {
    render(<WindowConfigurator />);
    fireEvent.click(screen.getByRole('radio', { name: 'Panoramiczne (pasek)' }));
    fireEvent.change(screen.getByLabelText('Szerokość otworu'), { target: { value: '100' } });
    expect(screen.getByRole('status')).toHaveTextContent('ponad 50 % pola nadruku');
  });
});
