import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtwork, createConfiguration } from '../domain/factories';
import i18n from '../i18n';
import { useConfigurationStore } from '../state/configurationStore';
import { DielineView } from './DielineView';

const store = () => useConfigurationStore.getState();
const addArtwork = (position: 'FRONT' | 'BACK' | 'LEFT', url: string) =>
  act(() =>
    store().setPanelArtwork(
      position,
      createArtwork({ fileName: `${position}.png`, fileUrl: url, mimeType: 'image/png', width: 1000, height: 2000, sizeBytes: 10 }),
    ),
  );

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
  URL.revokeObjectURL = vi.fn();
});

describe('DielineView', () => {
  it('draws the sheet with cut and crease layers and dimension labels', () => {
    const { container } = render(<DielineView />);
    expect(screen.getByRole('img', { name: /arkusz 720 × 490 mm/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-layer="cut"] path')).toHaveLength(1);
    expect(container.querySelectorAll('[data-layer="crease"] [data-code="C8"]')).toHaveLength(2);
    expect(screen.getByText('W 200 mm')).toBeInTheDocument();
    expect(screen.getByText('PRZÓD')).toBeInTheDocument();
    expect(screen.getByText(/Brak grafik/)).toBeInTheDocument();
  });

  it('shows artwork as soon as it is uploaded and hides it with the toggle', () => {
    const { container } = render(<DielineView />);
    expect(container.querySelectorAll('image')).toHaveLength(0);
    addArtwork('FRONT', 'blob:front');
    expect(container.querySelectorAll('image')).toHaveLength(1);
    addArtwork('BACK', 'blob:back');
    // BACK is split over both ends of the sheet.
    expect(container.querySelectorAll('image[href="blob:back"]')).toHaveLength(2);

    fireEvent.click(screen.getByLabelText('Grafiki'));
    expect(container.querySelectorAll('image')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Grafiki'));
    expect(container.querySelectorAll('image')).toHaveLength(3);
  });

  it('toggles creases and dimensions', () => {
    const { container } = render(<DielineView />);
    fireEvent.click(screen.getByLabelText('Bigi'));
    expect(container.querySelector('[data-layer="crease"]')).toBeNull();
    fireEvent.click(screen.getByLabelText('Wymiary'));
    expect(screen.queryByText('W 200 mm')).not.toBeInTheDocument();
  });

  it('edits the selected artwork with the keyboard and the toolbar', () => {
    render(<DielineView />);
    addArtwork('LEFT', 'blob:left');
    const artwork = screen.getByRole('button', { name: /Grafika: Bok lewy/ });
    fireEvent.focus(artwork);
    fireEvent.keyDown(artwork, { key: 'ArrowRight' });
    fireEvent.keyDown(artwork, { key: 'ArrowUp', shiftKey: true });
    expect(store().configuration.panels.LEFT.placement).toEqual({ mode: 'CUSTOM', offsetX: 1, offsetY: 10, scale: 1, rotation: 0 });

    const toolbar = screen.getByRole('toolbar', { name: /Bok lewy/ });
    expect(toolbar).toHaveTextContent('skala 100%');
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ grafikę' }));
    expect(store().configuration.panels.LEFT.placement).toMatchObject({ scale: 1.1 });
    fireEvent.keyDown(artwork, { key: 'r' });
    expect(store().configuration.panels.LEFT.placement).toMatchObject({ rotation: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'Resetuj' }));
    expect(store().configuration.panels.LEFT.placement).toEqual({ mode: 'FILL' });
  });

  it('switches labels with the language', async () => {
    render(<DielineView />);
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('FRONT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeInTheDocument();
  });
});
