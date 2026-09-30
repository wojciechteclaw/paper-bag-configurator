import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWATCH_LIBRARY_RULES } from '../../domain/config/productCatalog';
import { createArtwork, createConfiguration } from '../../domain/factories';
import i18n from '../../i18n';
import { useConfigurationStore } from '../../state/configurationStore';
import { SWATCH_LIBRARY_STORAGE_KEY, useSwatchLibraryStore } from '../../state/swatchLibraryStore';
import { buildAse } from '../../test/aseBuilder';
import { InkCoveragePanel } from '../components/InkCoveragePanel';
import { ProductionOptions } from '../components/ProductionOptions';

// jsdom cannot decode images: every artwork samples as one opaque pixel close to PANTONE 186 C.
vi.mock('../artwork/sampleArtworkPixels', () => ({
  loadArtworkSample: vi.fn(async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([200, 16, 46, 255]) })),
  pruneArtworkSamples: vi.fn(),
}));

const config = () => useConfigurationStore.getState().configuration;

const libraryBytes = () =>
  buildAse([
    { kind: 'groupStart', name: 'Solid Coated' },
    { kind: 'color', name: 'PANTONE 186 C', model: 'RGB ', values: [200 / 255, 16 / 255, 46 / 255] },
    { kind: 'color', name: 'PANTONE 485 C', model: 'RGB ', values: [218 / 255, 41 / 255, 28 / 255] },
    { kind: 'color', name: 'PANTONE 7621 C', model: 'RGB ', values: [0x12 / 255, 0x34 / 255, 0x56 / 255] },
    { kind: 'groupEnd' },
    { kind: 'color', name: 'Custom HKS', model: 'HKS ', values: [0] },
  ]);

const aseFile = (bytes: ArrayBuffer, name = 'Solid Coated.ase') => new File([bytes], name, { type: 'application/octet-stream' });

const chooseFile = (file: File) => fireEvent.change(screen.getByLabelText('Plik wzornika kolorów (.ase)'), { target: { files: [file] } });

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  useSwatchLibraryStore.getState().clearLibrary();
  localStorage.clear();
});

describe('swatch library import (Nadruk i produkcja)', () => {
  it('imports an .ase file and shows its name, colour count, skipped entries and the privacy note', async () => {
    render(<ProductionOptions />);
    expect(screen.getByText(/Brak wzornika/)).toBeInTheDocument();
    expect(screen.getByText(/Wzornik zostaje tylko w tej przeglądarce/)).toBeInTheDocument();

    chooseFile(aseFile(libraryBytes()));
    expect(await screen.findByText('Wzornik „Solid Coated” (Solid Coated.ase): 3 kolory.')).toBeInTheDocument();
    expect(screen.getByText(/Pominięte wpisy: 1/)).toBeInTheDocument();
    expect(localStorage.getItem(SWATCH_LIBRARY_STORAGE_KEY)).not.toBeNull();
    // Not part of the configuration.
    expect(JSON.stringify(config())).not.toContain('Solid Coated');

    fireEvent.click(screen.getByRole('button', { name: 'Usuń wzornik' }));
    expect(screen.getByText(/Brak wzornika/)).toBeInTheDocument();
    expect(localStorage.getItem(SWATCH_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  it('shows a clear error for a file that is not ASE and keeps the previous library', async () => {
    useSwatchLibraryStore.getState().importAse('Mine.ase', libraryBytes());
    render(<ProductionOptions />);
    chooseFile(aseFile(new TextEncoder().encode('%PDF-1.7').buffer as ArrayBuffer, 'guide.pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent('To nie jest plik Adobe Swatch Exchange (.ase).');
    expect(screen.getByText(/Wzornik „Mine”/)).toBeInTheDocument();
  });

  it('rejects files over the size limit before reading them', async () => {
    render(<ProductionOptions />);
    const file = aseFile(libraryBytes());
    Object.defineProperty(file, 'size', { value: SWATCH_LIBRARY_RULES.maxFileSizeBytes + 1 });
    chooseFile(file);
    expect(await screen.findByRole('alert')).toHaveTextContent('Plik jest za duży (maks. 5 MB).');
    expect(useSwatchLibraryStore.getState().library).toBeNull();
  });

  it('uses the library colour as the preview when adding a code it contains, and marks it', () => {
    useSwatchLibraryStore.getState().importAse('Solid Coated.ase', libraryBytes());
    render(<ProductionOptions />);
    const input = screen.getByLabelText('Kod Pantone');
    fireEvent.change(input, { target: { value: 'pms 7621 c' } });
    expect(screen.getByText(/We wzorniku: PANTONE 7621 C/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(config().print.pantoneColors).toEqual([{ code: 'pms 7621 c', hex: '#123456' }]);
    expect(screen.getByText('z wzornika')).toHaveAttribute('title', 'Kolor podglądu z wzornika „Solid Coated”');

    // Edited preview → one click restores the library colour.
    fireEvent.change(screen.getByLabelText('Kolor podglądu pms 7621 c'), { target: { value: '#000000' } });
    expect(screen.queryByText('z wzornika')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Użyj koloru z wzornika dla pms 7621 c' }));
    expect(config().print.pantoneColors[0].hex).toBe('#123456');
  });

  it('keeps the built-in suggestions for codes missing from the library', () => {
    useSwatchLibraryStore.getState().importAse('Solid Coated.ase', libraryBytes());
    render(<ProductionOptions />);
    fireEvent.change(screen.getByLabelText('Kod Pantone'), { target: { value: 'PMS 300 C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(config().print.pantoneColors).toEqual([{ code: 'PMS 300 C', hex: '#005eb8' }]);
    expect(screen.queryByText('z wzornika')).not.toBeInTheDocument();
  });
});

describe('nearest library swatches of detected artwork colours', () => {
  const addFrontArtwork = () =>
    useConfigurationStore
      .getState()
      .setPanelArtwork(
        'FRONT',
        createArtwork({ fileName: 'a.png', fileUrl: 'blob:a', mimeType: 'image/png', width: 100, height: 200, sizeBytes: 1 }),
      );

  it('keeps the current table without a library', async () => {
    addFrontArtwork();
    render(<InkCoveragePanel />);
    const table = await screen.findByRole('table', { hidden: true });
    expect(within(table).queryByText('Wzornik (najbliższy)')).not.toBeInTheDocument();
  });

  it('lists the nearest swatches with ΔE00 and adds one to the print colours in one click', async () => {
    useSwatchLibraryStore.getState().importAse('Solid Coated.ase', libraryBytes());
    addFrontArtwork();
    render(<InkCoveragePanel />);
    const table = await screen.findByRole('table', { hidden: true });
    expect(within(table).getByText('Wzornik (najbliższy)')).toBeInTheDocument();
    expect(within(table).getByText('PANTONE 186 C')).toBeInTheDocument();
    expect(within(table).getByText('ΔE00 0')).toBeInTheDocument();
    expect(within(table).getByText('PANTONE 485 C')).toBeInTheDocument();
    expect(within(table).queryByText('PANTONE 7621 C')).not.toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: 'Dodaj PANTONE 186 C do kolorów nadruku', hidden: true }));
    expect(config().print.pantoneColors).toEqual([{ code: 'PANTONE 186 C', hex: '#c8102e' }]);
    const listed = await within(table).findByRole('button', { name: /^Dodaj PANTONE 186 C do kolorów nadruku — /, hidden: true });
    expect(listed).toBeDisabled();
    expect(listed).toHaveTextContent('na liście');
  });

  it('does not duplicate a code already listed under another prefix and respects the colour limit', async () => {
    useSwatchLibraryStore.getState().importAse('Solid Coated.ase', libraryBytes());
    useConfigurationStore.getState().addPantoneColor('PMS 186 C');
    for (let i = 0; i < 7; i++) useConfigurationStore.getState().addPantoneColor(`PMS ${i} C`);
    addFrontArtwork();
    render(<InkCoveragePanel />);
    const table = await screen.findByRole('table', { hidden: true });
    const buttons = within(table).getAllByRole('button', { hidden: true }).filter((b) => b.className.includes('swatch-suggestions__add'));
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(buttons[0]).toHaveTextContent('na liście');
    expect(buttons[1]).toHaveAttribute('title', 'Osiągnięto limit 8 kolorów nadruku.');
  });
});
