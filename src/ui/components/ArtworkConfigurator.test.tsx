import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtwork, createConfiguration } from '../../domain/factories';
import i18n from '../../i18n';
import { useConfigurationStore } from '../../state/configurationStore';
import { loadImageFile } from '../artwork/loadImageFile';
import { ArtworkConfigurator } from './ArtworkConfigurator';

vi.mock('../artwork/loadImageFile', () => ({ loadImageFile: vi.fn() }));

const loadImage = vi.mocked(loadImageFile);
const config = () => useConfigurationStore.getState().configuration;

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  loadImage.mockReset();
  URL.revokeObjectURL = vi.fn();
});

describe('ArtworkConfigurator — artwork layout', () => {
  it('shows four wall uploaders by default and one whole-bag uploader after switching', () => {
    render(<ArtworkConfigurator />);
    expect(screen.getByRole('radio', { name: 'Osobna grafika na każdą ściankę' })).toBeChecked();
    expect(screen.getAllByRole('button', { name: /^Ścianka .*: dodaj grafikę$/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole('radio', { name: 'Jedna grafika na całą torbę' }));
    expect(config().artworkLayout).toBe('WRAP');
    expect(screen.queryByRole('button', { name: /^Ścianka / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cała torba: dodaj grafikę' })).toBeInTheDocument();
    // Wall row size 2W + 2D × H and the sheet order are shown.
    expect(screen.getByText('700 × 400 mm')).toBeInTheDocument();
    expect(screen.getByText(/Lewa \| Przednia \| Prawa \| Tylna/)).toBeInTheDocument();
  });

  it('uploads one image into the wrap slot and warns when its proportions differ from the wall row', async () => {
    useConfigurationStore.getState().setArtworkLayout('WRAP');
    loadImage.mockResolvedValue({ url: 'blob:wrap', width: 1000, height: 1000 });
    render(<ArtworkConfigurator />);
    fireEvent.change(screen.getByLabelText('Cała torba: plik grafiki'), {
      target: { files: [new File([new Uint8Array(100)], 'wrap.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(config().wrapArtwork.artwork?.fileUrl).toBe('blob:wrap'));
    expect(config().panels.FRONT.artwork).toBeNull();
    expect(await screen.findByText(/rozłożonych ścianek torby \(1,75\)/)).toBeInTheDocument();
  });

  it('tells the user that artwork of the inactive layout is kept', () => {
    const { setPanelArtwork, setArtworkLayout } = useConfigurationStore.getState();
    setPanelArtwork(
      'FRONT',
      createArtwork({ fileName: 'front.png', fileUrl: 'blob:front', mimeType: 'image/png', width: 200, height: 400, sizeBytes: 1 }),
    );
    setArtworkLayout('WRAP');
    render(<ArtworkConfigurator />);
    expect(screen.getByText(/Grafiki poszczególnych ścianek są zachowane/)).toBeInTheDocument();
  });
});
