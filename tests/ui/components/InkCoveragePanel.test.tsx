import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtwork, createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { loadArtworkSample } from '../../../src/ui/artwork/sampleArtworkPixels';
import { InkCoveragePanel } from '../../../src/ui/components/InkCoveragePanel';

// jsdom cannot decode images: feed a 1 × 1 opaque red sample for every artwork.
vi.mock('../../../src/ui/artwork/sampleArtworkPixels', () => ({
  loadArtworkSample: vi.fn(async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([200, 16, 46, 255]) })),
  pruneArtworkSamples: vi.fn(),
}));

const store = () => useConfigurationStore.getState();
const addFrontArtwork = () =>
  store().setPanelArtwork(
    'FRONT',
    createArtwork({ fileName: 'a.png', fileUrl: 'blob:a', mimeType: 'image/png', width: 100, height: 200, sizeBytes: 1 }),
  );

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
});

describe('InkCoveragePanel', () => {
  it('asks for artwork when there is none', () => {
    render(<InkCoveragePanel />);
    expect(screen.getByText('Dodaj grafiki, aby oszacować pokrycie farbą.')).toBeInTheDocument();
  });

  it('shows the total and the unassigned share with a hint when no Pantone colours are listed', async () => {
    addFrontArtwork();
    render(<InkCoveragePanel />);
    expect(await screen.findByText('bez przypisanego koloru')).toBeInTheDocument();
    expect(screen.getByText(/Dodaj kolory Pantone/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Łącznie' })).toHaveAttribute('aria-valuenow');
  });

  it('shows a bar per Pantone colour and updates live', async () => {
    addFrontArtwork();
    store().addPantoneColor('PMS 186 C');
    store().addPantoneColor('PMS 300 C');
    render(<InkCoveragePanel />);
    const red = await screen.findByRole('meter', { name: 'PMS 186 C' });
    await waitFor(() => expect(Number(red.getAttribute('aria-valuenow'))).toBeGreaterThan(0));
    expect(screen.getByRole('meter', { name: 'PMS 300 C' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('bez przypisanego koloru')).not.toBeInTheDocument();

    store().setPanelArtwork('FRONT', null);
    expect(await screen.findByText('Dodaj grafiki, aby oszacować pokrycie farbą.')).toBeInTheDocument();
  });

  it('lists the artwork colours (HEX) with area, nearest Pantone and total in a collapsible section', async () => {
    addFrontArtwork();
    store().addPantoneColor('PMS 186 C');
    render(<InkCoveragePanel />);
    const summary = await screen.findByText('Kolory w grafikach (HEX)');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    const table = await screen.findByRole('table', { hidden: true });
    expect(within(table).getByText('#c8102e')).toBeInTheDocument();
    expect(within(table).getByText(/^PMS 186 C \(ΔE/)).toBeInTheDocument();
    expect(within(table).getByText('Pantone (najbliższy)')).toBeInTheDocument();
    expect(within(table).getByText('Łącznie')).toBeInTheDocument();
  });

  it('merges similar colours with the tolerance slider and the minimum spot select, stored in the configuration', async () => {
    // Red and a near-identical red (ΔE00 ≈ 1.2).
    vi.mocked(loadArtworkSample).mockResolvedValue({ width: 2, height: 1, data: new Uint8ClampedArray([200, 16, 46, 255, 204, 20, 50, 255]) });
    addFrontArtwork();
    render(<InkCoveragePanel />);
    expect(await screen.findByText('2 odcienie połączono w 1 kolor')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Łączenie podobnych kolorów', hidden: true });
    expect(slider).toHaveValue('10');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(store().configuration.print.colorAnalysis.mergeTolerance).toBe(0);
    expect(await screen.findByText('2 odcienie połączono w 2 kolory')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /Minimalna plama koloru/, hidden: true });
    fireEvent.change(select, { target: { value: '0.01' } });
    expect(store().configuration.print.colorAnalysis.minAreaShare).toBe(0.01);
  });
});
