import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../src/i18n';
import { usePreviewStore } from '../../../src/state/previewStore';
import { FoldSlider } from '../../../src/ui/components/FoldSlider';

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  usePreviewStore.setState({ viewMode: 'SHEET', progress: 0, playing: false });
});

describe('FoldSlider (timeline)', () => {
  it('shows the timeline in percent and writes it to the preview store', () => {
    render(<FoldSlider />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('0');
    fireEvent.change(slider, { target: { value: '35' } });
    expect(usePreviewStore.getState().progress).toBeCloseTo(0.35);
    expect(screen.getByText('35 %')).toBeInTheDocument();
  });

  it('names the current stage (sheet, assembly phases, fold)', () => {
    render(<FoldSlider />);
    expect(screen.getByText('Płaski arkusz')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } });
    expect(screen.getByText(/rękaw/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '34' } });
    expect(screen.getByText(/trapez tylny/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    expect(screen.getByText(/na płasko/)).toBeInTheDocument();
  });

  it('is labelled and has a play button', () => {
    render(<FoldSlider />);
    expect(screen.getByRole('slider')).toHaveAccessibleName();
    expect(screen.getByRole('button', { name: 'Odtwórz składanie' })).toBeInTheDocument();
  });
});
