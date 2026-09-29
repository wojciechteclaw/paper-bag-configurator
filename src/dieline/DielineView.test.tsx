import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PLACEMENT } from '../domain/artworkPlacement';
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
    expect(screen.getByRole('img', { name: /arkusz 710 × 490 mm/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-layer="cut"] path')).toHaveLength(1);
    expect(container.querySelectorAll('[data-layer="crease"] [data-code="C8"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-layer="crease"] .dl-crease--mountain').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-layer="crease"] .dl-crease--valley').length).toBeGreaterThan(0);
    expect(container.querySelector('polygon[data-zone="GLUE_FLAP"]')).not.toBeNull();
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
    // BACK is one whole column (the seam is on the BACK/LEFT edge).
    expect(container.querySelectorAll('image[href="blob:back"]')).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Grafiki'));
    expect(container.querySelectorAll('image')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Grafiki'));
    expect(container.querySelectorAll('image')).toHaveLength(2);
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
    expect(store().configuration.panels.LEFT.placement).toEqual({ mode: 'CUSTOM', offsetX: 1, offsetY: 10, scale: 1, rotation: 0, extendToBottom: false });

    const toolbar = screen.getByRole('toolbar', { name: /Bok lewy/ });
    expect(toolbar).toHaveTextContent('skala 100%');
    fireEvent.click(screen.getByRole('button', { name: 'Powiększ grafikę' }));
    expect(store().configuration.panels.LEFT.placement).toMatchObject({ scale: 1.1 });
    fireEvent.keyDown(artwork, { key: 'r' });
    expect(store().configuration.panels.LEFT.placement).toMatchObject({ rotation: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'Resetuj' }));
    expect(store().configuration.panels.LEFT.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('aligns the selected artwork with the align buttons (FILL → contain first)', () => {
    render(<DielineView />);
    addArtwork('FRONT', 'blob:front'); // 1000 × 2000 px → contain on 200 × 400 = 200 × 400 (fills the wall)
    fireEvent.focus(screen.getByRole('button', { name: /Grafika: Przód/ }));
    expect(screen.getByRole('group', { name: 'Wyrównaj w poziomie' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wyrównaj do lewej' }));
    expect(store().configuration.panels.FRONT.placement).toEqual({
      mode: 'CUSTOM',
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      rotation: 0,
      extendToBottom: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pomniejsz grafikę' })); // 1/1.1 → ≈ 181.8 × 363.6 mm
    fireEvent.click(screen.getByRole('button', { name: 'Wyrównaj do prawej' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wyrównaj do góry' }));
    const placement = store().configuration.panels.FRONT.placement;
    expect(placement.mode === 'CUSTOM' && placement.offsetX).toBeCloseTo((200 - 200 / 1.1) / 2);
    expect(placement.mode === 'CUSTOM' && placement.offsetY).toBeCloseTo((400 - 400 / 1.1) / 2);
  });

  it('"Rozciągnij na dno" extends the artwork area and the clip into the bottom allowance', () => {
    const { container } = render(<DielineView />);
    addArtwork('FRONT', 'blob:front');
    fireEvent.focus(screen.getByRole('button', { name: /Grafika: Przód/ }));
    const clip = () => container.querySelector('clipPath[id="dv-clip-FRONT"] rect')!;
    // Sheet 490 tall, a = 90: without the extension the clip ends 2 mm below the bottom line (SVG y = 400 + 2).
    expect(Number(clip().getAttribute('y')) + Number(clip().getAttribute('height'))).toBeCloseTo(402);
    const toggle = screen.getByRole('checkbox', { name: 'Rozciągnij na dno' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(store().configuration.panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    expect(screen.getByRole('checkbox', { name: 'Rozciągnij na dno' })).toBeChecked();
    expect(screen.getByText('rozciągnięta na ściankę i dno')).toBeInTheDocument();
    // Clip now runs to the tube end + 3 mm bleed; FILL spans the whole 200 × 490 area.
    expect(Number(clip().getAttribute('y')) + Number(clip().getAttribute('height'))).toBeCloseTo(493);
    const area = container.querySelector('.dieline-view__area')!;
    expect(area.getAttribute('height')).toBe('490');
    // The FRONT allowance is marked as carrying artwork (no grey tint); the others stay bare paper.
    expect(container.querySelector('[data-zone="BOTTOM_ALLOWANCE"][data-panel="FRONT"]')?.getAttribute('data-printed')).toBe('true');
    expect(container.querySelector('[data-zone="BOTTOM_ALLOWANCE"][data-panel="LEFT"]')?.getAttribute('data-printed')).toBe('false');
    expect(screen.getByText('zapas na dno z grafiką (kolory na dnie)')).toBeInTheDocument();
    // "Rozciągnij" (fill) keeps the extension; "Resetuj" clears it.
    fireEvent.click(screen.getByRole('button', { name: 'Rozciągnij' }));
    expect(store().configuration.panels.FRONT.placement).toEqual({ mode: 'FILL', extendToBottom: true });
    fireEvent.click(screen.getByRole('button', { name: 'Resetuj' }));
    expect(store().configuration.panels.FRONT.placement).toEqual(DEFAULT_PLACEMENT);
  });

  it('switches labels with the language', async () => {
    render(<DielineView />);
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('FRONT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeInTheDocument();
  });
});
