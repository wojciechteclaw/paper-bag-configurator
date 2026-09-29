import { beforeEach, describe, expect, it } from 'vitest';
import { getStandingFoldProgress } from '../domain/geometry/foldKinematics';
import { useConfigurationStore } from './configurationStore';
import { FOLD_PRESETS, findFoldPreset, usePreviewStore } from './previewStore';

const preview = () => usePreviewStore.getState();

beforeEach(() => usePreviewStore.setState({ viewMode: 'BOX', foldProgress: 0 }));

describe('previewStore', () => {
  it('starts as the open 3D box', () => {
    expect(preview().foldProgress).toBe(0);
    expect(preview().viewMode).toBe('BOX');
  });

  it('clamps foldProgress to [0, 1] and ignores NaN', () => {
    preview().setFoldProgress(0.4);
    expect(preview().foldProgress).toBe(0.4);
    preview().setFoldProgress(3);
    expect(preview().foldProgress).toBe(1);
    preview().setFoldProgress(-1);
    expect(preview().foldProgress).toBe(0);
    preview().setFoldProgress(Number.NaN);
    expect(preview().foldProgress).toBe(0);
  });

  it('is not part of the configuration', () => {
    const before = useConfigurationStore.getState().configuration;
    preview().setFoldProgress(0.8);
    preview().setViewMode('DIELINE');
    expect(useConfigurationStore.getState().configuration).toBe(before);
    expect(before).not.toHaveProperty('foldProgress');
    expect(before).not.toHaveProperty('viewMode');
  });
});

describe('view modes', () => {
  it('uses p = 0 / ≈ 0.25 / 1 for BOX / STANDING / FLAT', () => {
    expect(FOLD_PRESETS.BOX).toBe(0);
    expect(FOLD_PRESETS.FLAT).toBe(1);
    expect(FOLD_PRESETS.STANDING).toBe(0.25);
    expect(Math.abs(FOLD_PRESETS.STANDING - getStandingFoldProgress())).toBeLessThanOrEqual(0.005);
  });

  it('sets the preset fold progress when a 3D mode is selected', () => {
    preview().setViewMode('FLAT');
    expect(preview()).toMatchObject({ viewMode: 'FLAT', foldProgress: 1 });
    preview().setViewMode('STANDING');
    expect(preview()).toMatchObject({ viewMode: 'STANDING', foldProgress: FOLD_PRESETS.STANDING });
  });

  it('keeps the fold progress when switching to the dieline', () => {
    preview().setViewMode('FLAT');
    preview().setViewMode('DIELINE');
    expect(preview()).toMatchObject({ viewMode: 'DIELINE', foldProgress: 1 });
    preview().setFoldProgress(0.3);
    expect(preview().viewMode).toBe('DIELINE');
  });

  it('deselects the mode when the slider leaves a preset and reselects on an exact hit', () => {
    preview().setViewMode('FLAT');
    preview().setFoldProgress(0.42);
    expect(preview().viewMode).toBeNull();
    preview().setFoldProgress(25 / 100); // slider value 25 %
    expect(preview().viewMode).toBe('STANDING');
    preview().setFoldProgress(0);
    expect(preview().viewMode).toBe('BOX');
  });

  it('matches presets exactly only', () => {
    expect(findFoldPreset(1)).toBe('FLAT');
    expect(findFoldPreset(0.26)).toBeNull();
  });
});
