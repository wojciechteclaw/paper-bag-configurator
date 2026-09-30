import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BAG_TYPES } from '../../../src/domain/config/productCatalog';
import { createConfiguration } from '../../../src/domain/factories';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { DimensionsForm } from '../../../src/ui/components/DimensionsForm';

const dims = () => useConfigurationStore.getState().configuration.dimensions;

// Defaults: width 200, height 400, depth 150.
beforeEach(async () => {
  await i18n.changeLanguage('pl');
  useConfigurationStore.setState({ configuration: createConfiguration('BLOCK') });
});

const widthInput = () => screen.getByLabelText('Szerokość') as HTMLInputElement;
const depthInput = () => screen.getByLabelText('Głębokość') as HTMLInputElement;

describe('DimensionsForm — width/depth lock', () => {
  it('lets the user type freely without clamping per keystroke', () => {
    render(<DimensionsForm />);
    const input = widthInput();

    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('1');
    expect(dims().width).toBe(200);

    fireEvent.change(input, { target: { value: '15' } });
    expect(input.value).toBe('15');
    expect(dims().width).toBe(200);

    fireEvent.change(input, { target: { value: '150' } });
    expect(input.value).toBe('150');
    expect(dims().width).toBe(150);
  });

  it('shows the translated error while the draft is invalid and does not commit it', () => {
    render(<DimensionsForm />);
    fireEvent.change(widthInput(), { target: { value: '100' } });
    expect(screen.getByText('Głębokość nie może być większa od szerokości')).toBeInTheDocument();
    expect(widthInput()).toHaveAttribute('aria-invalid', 'true');
    expect(dims().width).toBe(200);

    fireEvent.change(widthInput(), { target: { value: '212' } });
    expect(screen.getByText('Wymiar musi być wielokrotnością 5 mm')).toBeInTheDocument();
    expect(dims().width).toBe(200);
  });

  it('commits the clamped value on blur', () => {
    render(<DimensionsForm />);
    fireEvent.change(widthInput(), { target: { value: '1' } });
    fireEvent.blur(widthInput());
    expect(dims().width).toBe(150);
    expect(widthInput().value).toBe('150');
    expect(screen.queryByText(/Minimum/)).not.toBeInTheDocument();
  });

  it('commits the clamped depth on Enter', () => {
    render(<DimensionsForm />);
    fireEvent.change(depthInput(), { target: { value: '260' } });
    fireEvent.keyDown(depthInput(), { key: 'Enter' });
    expect(dims().depth).toBe(200);
    expect(depthInput().value).toBe('200');
  });

  it('snaps an off-step value on blur', () => {
    render(<DimensionsForm />);
    const height = screen.getByLabelText('Wysokość') as HTMLInputElement;
    fireEvent.change(height, { target: { value: '302' } });
    fireEvent.blur(height);
    expect(dims().height).toBe(300);
  });

  it('reverts an empty field to the stored value on blur', () => {
    render(<DimensionsForm />);
    fireEvent.change(widthInput(), { target: { value: '' } });
    expect(screen.getByText('Podaj liczbę')).toBeInTheDocument();
    fireEvent.blur(widthInput());
    expect(dims().width).toBe(200);
    expect(widthInput().value).toBe('200');
  });

  it('allows width equal to depth', () => {
    render(<DimensionsForm />);
    fireEvent.change(depthInput(), { target: { value: '200' } });
    expect(dims().depth).toBe(200);
    expect(screen.queryByText('Głębokość nie może być większa od szerokości')).not.toBeInTheDocument();
  });

  it('sets spinner bounds from the effective limits', () => {
    render(<DimensionsForm />);
    expect(widthInput()).toHaveAttribute('min', '150');
    expect(widthInput()).toHaveAttribute('max', '450');
    expect(widthInput()).toHaveAttribute('step', '5');
    expect(depthInput()).toHaveAttribute('min', '40');
    expect(depthInput()).toHaveAttribute('max', '200');

    act(() => useConfigurationStore.getState().setDimension('depth', 100));
    expect(widthInput()).toHaveAttribute('min', '100');
  });
});

describe('DimensionsForm — standard size', () => {
  const sizeSelect = () => screen.getByLabelText('Rozmiar standardowy') as HTMLSelectElement;

  it('shows "Własny" for dimensions that match no preset', () => {
    render(<DimensionsForm />);
    expect(sizeSelect().value).toBe('');
    expect(sizeSelect().selectedOptions[0]).toHaveTextContent('Własny');
  });

  it('applies a preset to all three dimensions and selects it', () => {
    render(<DimensionsForm />);
    fireEvent.change(sizeSelect(), { target: { value: '80x45x220' } });
    expect(dims()).toEqual({ width: 80, depth: 45, height: 220 });
    expect(sizeSelect().value).toBe('80x45x220');
    expect(widthInput().value).toBe('80');

    // Editing a dimension turns it back into a custom size.
    act(() => useConfigurationStore.getState().setDimension('height', 225));
    expect(sizeSelect().value).toBe('');
  });

  it('disables oversize presets and explains why in the tooltip', () => {
    // The catalogue limits cover every standard size; narrow them temporarily to exercise the mechanism.
    const width = BAG_TYPES.BLOCK.limits.width;
    const max = width.max;
    width.max = 260;
    try {
      render(<DimensionsForm />);
      const option = Array.from(sizeSelect().options).find((o) => o.value === '320x220x400')!;
      expect(option).toBeDisabled();
      expect(option).toHaveTextContent('320 × 220 × 400 mm (XL) — poza zakresem');
      expect(sizeSelect()).toHaveAccessibleDescription(/320 × 220 × 400 mm: Szerokość 320 mm poza zakresem 75–260 mm/);
      expect(Array.from(sizeSelect().options).find((o) => o.value === '250x140x400')).toBeEnabled();
    } finally {
      width.max = max;
    }
  });

  it('lists the presets of the current handle variant', () => {
    act(() => {
      useConfigurationStore.getState().setHandle('FLAT_PAPER');
    });
    render(<DimensionsForm />);
    const values = Array.from(sizeSelect().options).map((o) => o.value);
    expect(values).toEqual([
      '',
      '180x85x230',
      '200x100x280',
      '220x110x250',
      '220x110x280',
      '250x110x280',
      '200x140x400',
      '250x140x300',
      '260x170x260',
      '260x170x290',
      '260x140x320',
      '280x170x280',
      '320x110x400',
      '320x160x400',
      '320x170x440',
      '320x220x250',
      '320x220x400',
      '350x170x250',
      '350x170x400',
      '450x170x470',
    ]);
    expect(Array.from(sizeSelect().options).filter((o) => o.disabled).map((o) => o.value)).toEqual([]);
  });

  it('explains when the handle variant has no standard sizes', () => {
    act(() => {
      useConfigurationStore.getState().setHandle('TWISTED_PAPER');
    });
    render(<DimensionsForm />);
    expect(screen.queryByLabelText('Rozmiar standardowy')).not.toBeInTheDocument();
    expect(screen.getByText(/nie ma rozmiarów standardowych/)).toBeInTheDocument();
  });
});

describe('DimensionsForm — info tooltip', () => {
  it('links the range and lock hint to the input via an (i) tooltip', () => {
    render(<DimensionsForm />);
    const tip = screen.getByRole('button', { name: 'Informacje: Szerokość' });
    const tooltipId = tip.getAttribute('aria-describedby');
    expect(tooltipId).toBeTruthy();

    const tooltip = document.getElementById(tooltipId!)!;
    expect(tooltip).toHaveAttribute('role', 'tooltip');
    expect(tooltip).toHaveTextContent('150–450 mm · min. = głębokość (150 mm)');
    expect(widthInput().getAttribute('aria-describedby')).toContain(tooltipId);
    expect(widthInput()).toHaveAccessibleDescription(/min\. = głębokość \(150 mm\)/);

    const depthTip = screen.getByRole('button', { name: 'Informacje: Głębokość' });
    expect(document.getElementById(depthTip.getAttribute('aria-describedby')!)).toHaveTextContent(
      'maks. = szerokość (200 mm)',
    );
  });

  it('is hidden by default and opens on hover, focus and tap; Escape closes it', () => {
    render(<DimensionsForm />);
    const tip = screen.getByRole('button', { name: 'Informacje: Szerokość' });
    const tooltip = document.getElementById(tip.getAttribute('aria-describedby')!)!;
    expect(tooltip).not.toHaveClass('is-open');

    fireEvent.mouseEnter(tip.parentElement!);
    expect(tooltip).toHaveClass('is-open');
    fireEvent.mouseLeave(tip.parentElement!);
    expect(tooltip).not.toHaveClass('is-open');

    fireEvent.focus(tip);
    expect(tooltip).toHaveClass('is-open');
    expect(tip).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tooltip).not.toHaveClass('is-open');

    fireEvent.click(tip);
    expect(tooltip).toHaveClass('is-open');
    fireEvent.click(tip);
    expect(tooltip).not.toHaveClass('is-open');
  });

  it('keeps validation errors visible inline, outside the tooltip', () => {
    render(<DimensionsForm />);
    fireEvent.change(widthInput(), { target: { value: '100' } });
    const error = screen.getByText('Głębokość nie może być większa od szerokości');
    expect(error.closest('[role="tooltip"]')).toBeNull();
    expect(widthInput()).toHaveAccessibleDescription(/Głębokość nie może być większa od szerokości/);
  });

  it('translates the hint to English', async () => {
    await act(() => i18n.changeLanguage('en'));
    render(<DimensionsForm />);
    const tip = screen.getByRole('button', { name: 'More info: Width' });
    expect(document.getElementById(tip.getAttribute('aria-describedby')!)).toHaveTextContent('min. = depth (150 mm)');
  });
});

describe('DimensionsForm — bottom trapezoid warning (W < D + 30)', () => {
  it('warns (without blocking) when the bottom trapezoid degenerates into a triangle', () => {
    render(<DimensionsForm />);
    expect(document.querySelector('[data-warning]')).toBeNull();
    fireEvent.change(depthInput(), { target: { value: '180' } }); // W 200 < D + 30 = 210
    expect(dims().depth).toBe(180);
    const warning = document.querySelector('[data-warning="BOTTOM_TRAPEZOID_DEGENERATE"]');
    expect(warning).toHaveTextContent('210 mm');
    fireEvent.change(depthInput(), { target: { value: '170' } }); // W = D + 30: fine
    expect(document.querySelector('[data-warning]')).toBeNull();
  });
});
