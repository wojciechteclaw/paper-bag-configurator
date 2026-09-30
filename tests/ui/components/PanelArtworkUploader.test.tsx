import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { loadImageFile } from '../../../src/ui/artwork/loadImageFile';
import { PanelArtworkUploader } from '../../../src/ui/components/PanelArtworkUploader';

vi.mock('../../../src/ui/artwork/loadImageFile', () => ({ loadImageFile: vi.fn() }));

const loadImage = vi.mocked(loadImageFile);
const panel = (position: 'FRONT' | 'LEFT') => useConfigurationStore.getState().configuration.panels[position];
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  loadImage.mockReset();
  URL.revokeObjectURL = vi.fn();
});

describe('PanelArtworkUploader', () => {
  it('rejects an unsupported file type without decoding it', async () => {
    render(<PanelArtworkUploader position="FRONT" />);
    fireEvent.change(screen.getByLabelText('Ścianka Przednia: plik grafiki'), {
      target: { files: [file('logo.pdf', 'application/pdf')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Nieobsługiwany format pliku');
    expect(loadImage).not.toHaveBeenCalled();
    expect(panel('FRONT').artwork).toBeNull();
  });

  it('stores a decoded image with its pixel size and shows a thumbnail', async () => {
    loadImage.mockResolvedValue({ url: 'blob:front', width: 1000, height: 2000 });
    render(<PanelArtworkUploader position="FRONT" />);
    fireEvent.drop(screen.getByRole('button', { name: 'Ścianka Przednia: dodaj grafikę' }), {
      dataTransfer: { files: [file('front.png', 'image/png')] },
    });
    expect(await screen.findByAltText('Miniatura: front.png')).toHaveAttribute('src', 'blob:front');
    expect(panel('FRONT').artwork).toMatchObject({ fileName: 'front.png', width: 1000, height: 2000, mimeType: 'image/png' });
    // 1000×2000 matches the 200×400 mm front panel → no distortion warning.
    expect(screen.queryByText(/zostanie zdeformowana/)).not.toBeInTheDocument();
  });

  it('warns about an aspect-ratio mismatch against the side panel (depth × height)', async () => {
    loadImage.mockResolvedValue({ url: 'blob:left', width: 1000, height: 1000 });
    render(<PanelArtworkUploader position="LEFT" />);
    expect(screen.getByText('150 × 400 mm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ścianka Lewa: plik grafiki'), {
      target: { files: [file('square.png', 'image/png')] },
    });
    expect(await screen.findByText(/zostanie zdeformowana/)).toBeInTheDocument();
  });

  it('reports images that cannot be decoded', async () => {
    loadImage.mockRejectedValue(new Error('broken'));
    render(<PanelArtworkUploader position="FRONT" />);
    fireEvent.change(screen.getByLabelText('Ścianka Przednia: plik grafiki'), {
      target: { files: [file('broken.png', 'image/png')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się odczytać obrazu');
    expect(panel('FRONT').artwork).toBeNull();
  });

  it('removes artwork and revokes its object URL', async () => {
    loadImage.mockResolvedValue({ url: 'blob:front', width: 1000, height: 2000 });
    render(<PanelArtworkUploader position="FRONT" />);
    fireEvent.change(screen.getByLabelText('Ścianka Przednia: plik grafiki'), {
      target: { files: [file('front.png', 'image/png')] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Usuń: Przednia' }));
    await waitFor(() => expect(panel('FRONT').artwork).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:front');
    expect(screen.getByRole('button', { name: 'Ścianka Przednia: dodaj grafikę' })).toBeInTheDocument();
  });
});
