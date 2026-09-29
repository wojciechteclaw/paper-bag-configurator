import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewStore } from '../../state/previewStore';
import { PreviewPanel } from './PreviewPanel';

// WebGL is not available in jsdom: replace the canvas with a probe that shows the props it receives.
vi.mock('../../renderer/BagPreview3D', () => ({
  BagPreview3D: ({ foldProgress }: { foldProgress: number }) => <div data-testid="bag-3d">{foldProgress}</div>,
}));
vi.mock('../../dieline/DielineView', () => ({ DielineView: () => <div data-testid="dieline" /> }));

beforeEach(() => usePreviewStore.setState({ viewMode: 'BOX', foldProgress: 0 }));

describe('PreviewPanel modes', () => {
  it('shows the 3D preview with the fold slider by default', () => {
    render(<PreviewPanel />);
    expect(screen.getByTestId('bag-3d')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('switches to the dieline and hides the slider', () => {
    render(<PreviewPanel />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId('dieline')).toBeInTheDocument();
    expect(screen.queryByTestId('bag-3d')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('selecting FLAT folds to 100 %; moving the slider deselects the mode', () => {
    render(<PreviewPanel />);
    const flat = screen.getAllByRole('button')[3];
    fireEvent.click(flat);
    expect(flat).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bag-3d')).toHaveTextContent('1');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(flat).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } });
    expect(screen.getAllByRole('button')[2]).toHaveAttribute('aria-pressed', 'true');
  });
});
