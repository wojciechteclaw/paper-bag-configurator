import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePreviewStore } from '../../state/previewStore';
import { FoldSlider } from './FoldSlider';

beforeEach(() => usePreviewStore.setState({ foldProgress: 0 }));

describe('FoldSlider', () => {
  it('shows the fold progress in percent and writes it to the preview store', () => {
    render(<FoldSlider />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('0');
    fireEvent.change(slider, { target: { value: '35' } });
    expect(usePreviewStore.getState().foldProgress).toBeCloseTo(0.35);
    expect(screen.getByText('35 %')).toBeInTheDocument();
  });

  it('is labelled', () => {
    render(<FoldSlider />);
    expect(screen.getByRole('slider')).toHaveAccessibleName();
  });
});
