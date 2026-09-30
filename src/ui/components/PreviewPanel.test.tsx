import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewStore } from '../../state/previewStore';
import { PreviewPanel } from './PreviewPanel';

// WebGL is not available in jsdom: replace the canvas with a probe that shows the props it receives.
vi.mock('../../renderer/BagPreview3D', () => ({
  BagPreview3D: ({ foldProgress, assemblyProgress }: { foldProgress: number; assemblyProgress: number }) => (
    <div data-testid="bag-3d">{`${assemblyProgress}|${foldProgress}`}</div>
  ),
}));
vi.mock('../../dieline/DielineView', () => ({ DielineView: () => <div data-testid="dieline" /> }));

beforeEach(() => usePreviewStore.setState({ viewMode: 'BOX', progress: 0.4, playing: false }));

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
