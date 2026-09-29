import { beforeEach, describe, expect, it } from 'vitest';
import { useConfigurationStore } from './configurationStore';
import { usePreviewStore } from './previewStore';

const preview = () => usePreviewStore.getState();

beforeEach(() => usePreviewStore.setState({ foldProgress: 0 }));

describe('previewStore', () => {
  it('starts unfolded', () => {
    expect(preview().foldProgress).toBe(0);
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
    expect(useConfigurationStore.getState().configuration).toBe(before);
    expect(before).not.toHaveProperty('foldProgress');
  });
});
