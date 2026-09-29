import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtwork, createConfiguration } from '../../domain/factories';
import i18n from '../../i18n';
import { useConfigurationStore } from '../../state/configurationStore';
import { InkCoveragePanel } from './InkCoveragePanel';

// jsdom cannot decode images: feed a 1 × 1 opaque red sample for every artwork.
vi.mock('../artwork/sampleArtworkPixels', () => ({
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
});
