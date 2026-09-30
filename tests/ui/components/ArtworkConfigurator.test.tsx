import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapLayerTarget } from '../../../src/domain/artworkLayout';
import { MAX_WRAP_ARTWORK_LAYERS } from '../../../src/domain/config/productCatalog';
import { createArtwork, createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { useConfiguratorUiStore } from '../../../src/state/configuratorUiStore';
import { usePreviewStore } from '../../../src/state/previewStore';
import { loadImageFile } from '../../../src/ui/artwork/loadImageFile';
import { ArtworkConfigurator } from '../../../src/ui/components/ArtworkConfigurator';

vi.mock('../../../src/ui/artwork/loadImageFile', () => ({ loadImageFile: vi.fn() }));

const loadImage = vi.mocked(loadImageFile);
const config = () => useConfigurationStore.getState().configuration;
const png = (name: string) => new File([new Uint8Array(100)], name, { type: 'image/png' });
const artwork = (name: string, width = 200, height = 400) =>
  createArtwork({ fileName: name, fileUrl: `blob:${name}`, mimeType: 'image/png', width, height, sizeBytes: 1 });

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  useConfiguratorUiStore.setState({ selectedArtwork: null });
  usePreviewStore.getState().setViewMode('BOX');
  loadImage.mockReset();
  URL.revokeObjectURL = vi.fn();
});

describe('ArtworkConfigurator — artwork layout', () => {
  it('shows four wall uploaders by default and the layer list after switching', () => {
    render(<ArtworkConfigurator />);
    expect(screen.getByRole('radio', { name: 'Osobna grafika na każdą ściankę' })).toBeChecked();
    expect(screen.getAllByRole('button', { name: /^Ścianka .*: dodaj grafikę$/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole('radio', { name: 'Grafika na całą torbę (warstwy)' }));
    expect(config().artworkLayout).toBe('WRAP');
    expect(screen.queryByRole('button', { name: /^Ścianka / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dodaj warstwę grafiki całej torby' })).toBeInTheDocument();
    expect(screen.getByText(/Brak warstw/)).toBeInTheDocument();
    // Wrap size 2W + 2D × H, layer count and the order around the bag (sheet order, from LEFT's free edge).
    expect(screen.getByText(`700 × 400 mm · 0 z ${MAX_WRAP_ARTWORK_LAYERS}`)).toBeInTheDocument();
    expect(screen.getByText(/Lewa \| Przednia \| Prawa \| Tylna — w kolejności wykroju, od lewej krawędzi lewego boku/)).toBeInTheDocument();
  });

  it('tells the user that artwork of the inactive layout is kept', () => {
    const { setPanelArtwork, setArtworkLayout } = useConfigurationStore.getState();
    setPanelArtwork('FRONT', artwork('front.png'));
    setArtworkLayout('WRAP');
    render(<ArtworkConfigurator />);
    expect(screen.getByText(/Grafiki innych układów \(Osobna grafika na każdą ściankę\) są zachowane/)).toBeInTheDocument();
  });
});

describe('ArtworkConfigurator — whole-bag layers', () => {
  beforeEach(() => {
    useConfigurationStore.getState().setArtworkLayout('WRAP');
  });

  it('adds uploaded files as layers on top, selects the new layer and warns about stretched proportions', async () => {
    render(<ArtworkConfigurator />);
    loadImage.mockResolvedValueOnce({ url: 'blob:bg', width: 1000, height: 1000 });
    fireEvent.change(screen.getByLabelText('Plik nowej warstwy grafiki'), { target: { files: [png('tło.png')] } });
    await waitFor(() => expect(config().wrapLayers).toHaveLength(1));
    expect(config().wrapLayers[0]).toMatchObject({ artwork: expect.objectContaining({ fileUrl: 'blob:bg' }), placement: { mode: 'FILL' } });
    expect(useConfiguratorUiStore.getState().selectedArtwork).toBe(wrapLayerTarget(config().wrapLayers[0].id));
    // FILL over 700 × 400 with a square image → distortion warning.
    expect(await screen.findByText(/ścianek dookoła torby \(1,75\)/)).toBeInTheDocument();

    loadImage.mockResolvedValueOnce({ url: 'blob:logo', width: 100, height: 100 });
    fireEvent.change(screen.getByLabelText('Plik nowej warstwy grafiki'), { target: { files: [png('logo.png')] } });
    await waitFor(() => expect(config().wrapLayers).toHaveLength(2));
    expect(config().wrapLayers[1].placement.mode).toBe('CUSTOM');
    expect(config().panels.FRONT.artwork).toBeNull();

    // Top layer first, as in graphics tools.
    const items = within(screen.getByRole('list', { name: 'Warstwy grafiki, od wierzchniej' })).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/^Warstwa \d$/).textContent)).toEqual(['Warstwa 2', 'Warstwa 1']);
    expect(within(items[0]).getByText('logo.png')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Własne położenie/)).toBeInTheDocument();
    expect(screen.getByText(`700 × 400 mm · 2 z ${MAX_WRAP_ARTWORK_LAYERS}`)).toBeInTheDocument();
  });

  it('rejects invalid files with the shared validation (no layer added)', async () => {
    render(<ArtworkConfigurator />);
    fireEvent.change(screen.getByLabelText('Plik nowej warstwy grafiki'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Nieobsługiwany format pliku');
    expect(config().wrapLayers).toEqual([]);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('reorders, selects (synced with the dieline editor) and removes layers', () => {
    const { addWrapLayer } = useConfigurationStore.getState();
    const bg = addWrapLayer(artwork('bg.png'))!;
    const logo = addWrapLayer(artwork('logo.png'))!;
    render(<ArtworkConfigurator />);

    // Ends: the top layer cannot move up, the bottom one cannot move down.
    expect(screen.getByRole('button', { name: 'Warstwa 2: przesuń wyżej (bliżej wierzchu)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Warstwa 1: przesuń niżej' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Warstwa 1: przesuń wyżej (bliżej wierzchu)' }));
    expect(config().wrapLayers.map((layer) => layer.id)).toEqual([logo, bg]);

    // Selecting a layer is shared view state; "Edit on the dieline" opens the dieline view.
    const select = screen.getByRole('button', { name: /Warstwa 2: bg\.png — zaznacz/ });
    fireEvent.click(select);
    expect(useConfiguratorUiStore.getState().selectedArtwork).toBe(wrapLayerTarget(bg));
    expect(select).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Edytuj na wykroju' }));
    expect(usePreviewStore.getState().viewMode).toBe('DIELINE');
    // Clicking the selected layer again deselects it.
    fireEvent.click(select);
    expect(useConfiguratorUiStore.getState().selectedArtwork).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Usuń: Warstwa 2' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:bg.png');
    expect(config().wrapLayers.map((layer) => layer.id)).toEqual([logo]);
  });

  it('replaces a layer image in place', async () => {
    const { addWrapLayer } = useConfigurationStore.getState();
    addWrapLayer(artwork('bg.png'));
    const logo = addWrapLayer(artwork('logo.png'))!;
    render(<ArtworkConfigurator />);
    loadImage.mockResolvedValueOnce({ url: 'blob:logo-2', width: 100, height: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Zamień: Warstwa 2' }));
    fireEvent.change(screen.getByLabelText('Plik zamieniający grafikę warstwy'), { target: { files: [png('logo-2.png')] } });
    await waitFor(() => expect(config().wrapLayers[1].artwork.fileUrl).toBe('blob:logo-2'));
    expect(config().wrapLayers[1].id).toBe(logo);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo.png');
  });

  it(`stops offering new layers at the limit of ${MAX_WRAP_ARTWORK_LAYERS}`, () => {
    const { addWrapLayer } = useConfigurationStore.getState();
    for (let i = 0; i < MAX_WRAP_ARTWORK_LAYERS; i++) addWrapLayer(artwork(`l${i}.png`));
    render(<ArtworkConfigurator />);
    expect(screen.queryByRole('button', { name: 'Dodaj warstwę grafiki całej torby' })).not.toBeInTheDocument();
    expect(screen.getByText(`Osiągnięto limit ${MAX_WRAP_ARTWORK_LAYERS} warstw — usuń warstwę, aby dodać nową.`)).toBeInTheDocument();
  });
});

describe('ArtworkConfigurator — whole-sheet layers', () => {
  it('offers the sheet layout with the print-file size (mm and px at 300 dpi) and adds sheet layers', async () => {
    render(<ArtworkConfigurator />);
    fireEvent.click(screen.getByRole('radio', { name: 'Grafika na cały arkusz (wykrój)' }));
    expect(config().artworkLayout).toBe('SHEET');
    // Block bag 200 × 400 × 150, glue flap 10: sheet 710 × 490 mm; the print file covers it without the flap,
    // 700 × 490 mm = 8268 × 5787 px at 300 dpi.
    expect(
      screen.getByText(`arkusz bez zakładki klejowej 700 × 490 mm = 8268 × 5787 px przy 300 dpi · 0 z ${MAX_WRAP_ARTWORK_LAYERS}`),
    ).toBeInTheDocument();
    expect(screen.getByText(/Plik jak do druku/)).toBeInTheDocument();

    loadImage.mockResolvedValueOnce({ url: 'blob:sheet', width: 1000, height: 1000 });
    fireEvent.change(screen.getByLabelText('Plik nowej warstwy grafiki'), { target: { files: [png('sheet.png')] } });
    await waitFor(() => expect(config().sheetLayers).toHaveLength(1));
    expect(config().wrapLayers).toEqual([]);
    expect(config().sheetLayers[0].placement).toEqual({ mode: 'FILL', extendToBottom: true });
    expect(useConfiguratorUiStore.getState().selectedArtwork).toBe(`SHEET:${config().sheetLayers[0].id}`);
    expect(screen.getByText('Rozciągnięta na arkusz (bez zakładki klejowej)')).toBeInTheDocument();
    // A square file stretched over the 700 × 490 area: proportion warning.
    expect(screen.getByText(/proporcji arkusza wykroju bez zakładki klejowej \(1,43\)/)).toBeInTheDocument();
  });
});
