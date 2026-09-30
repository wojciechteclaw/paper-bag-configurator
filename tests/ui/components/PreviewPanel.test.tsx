import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewStore } from '../../../src/state/previewStore';
import { PreviewPanel } from '../../../src/ui/components/PreviewPanel';

// WebGL is not available in jsdom: replace the canvas with a probe that shows the props it receives.
// The last `onAutoOrbitEnd` the probe received (to simulate the user grabbing the camera).
const renderer = vi.hoisted(() => ({ endOrbit: undefined as (() => void) | undefined }));
vi.mock('../../../src/renderer/BagPreview3D', () => ({
  BagPreview3D: ({
    foldProgress,
    assemblyProgress,
    autoOrbit,
    onAutoOrbitEnd,
  }: {
    foldProgress: number;
    assemblyProgress: number;
    autoOrbit?: boolean;
    onAutoOrbitEnd?: () => void;
  }) => {
    renderer.endOrbit = onAutoOrbitEnd;
    return <div data-testid="bag-3d" data-orbit={String(Boolean(autoOrbit))}>{`${assemblyProgress}|${foldProgress}`}</div>;
  },
}));
vi.mock('../../../src/dieline/DielineView', () => ({ DielineView: () => <div data-testid="dieline" /> }));

beforeEach(() => usePreviewStore.setState({ viewMode: 'BOX', progress: 0.4, playing: false, orbiting: false }));

describe('PreviewPanel camera orbit', () => {
  it('toggles the automatic orbit of the 3D camera and stops when the user takes over', () => {
    render(<PreviewPanel />);
    const orbit = screen.getByRole('button', { name: /Obracaj wokół torby/ });
    expect(orbit).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('bag-3d')).toHaveAttribute('data-orbit', 'false');
    fireEvent.click(orbit);
    expect(screen.getByRole('button', { name: 'Zatrzymaj obracanie' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bag-3d')).toHaveAttribute('data-orbit', 'true');
    // A drag on the canvas: the renderer reports it and the button pops out.
    act(() => renderer.endOrbit?.());
    expect(screen.getByTestId('bag-3d')).toHaveAttribute('data-orbit', 'false');
    expect(screen.getByRole('button', { name: /Obracaj wokół torby/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is only offered in 3D; switching to the dieline ends the orbit', () => {
    render(<PreviewPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Obracaj wokół torby/ }));
    fireEvent.click(modeButtons()[0]);
    expect(screen.queryByRole('button', { name: /Obracaj|Zatrzymaj obracanie/ })).not.toBeInTheDocument();
    expect(usePreviewStore.getState().orbiting).toBe(false);
  });
});

const modeButtons = () => screen.getByRole('group').querySelectorAll('button');

describe('PreviewPanel modes', () => {
  it('shows the 3D preview with the timeline slider by default', () => {
    render(<PreviewPanel />);
    expect(screen.getByTestId('bag-3d')).toHaveTextContent('1|0');
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect([...modeButtons()].filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('switches to the dieline and hides the slider', () => {
    render(<PreviewPanel />);
    fireEvent.click(modeButtons()[0]);
    expect(screen.getByTestId('dieline')).toBeInTheDocument();
    expect(screen.queryByTestId('bag-3d')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('SHEET starts the assembly from the flat sheet; the slider runs through assembly and fold', () => {
    render(<PreviewPanel />);
    const [, sheet, box, standing, flat] = modeButtons();
    fireEvent.click(sheet);
    expect(sheet).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bag-3d')).toHaveTextContent('0|0');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } });
    expect(sheet).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('bag-3d')).toHaveTextContent('0.5|0');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
    expect(box).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '45' } });
    expect(standing).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(flat);
    expect(screen.getByTestId('bag-3d')).toHaveTextContent('1|1');
  });

  it('has a play / pause button for the whole timeline', () => {
    render(<PreviewPanel />);
    const play = screen.getByRole('button', { name: /odtwórz|play/i });
    fireEvent.click(play);
    expect(usePreviewStore.getState().playing).toBe(true);
    expect(play).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(play);
    expect(usePreviewStore.getState().playing).toBe(false);
  });
});
