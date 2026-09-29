import { beforeEach, describe, expect, it } from 'vitest';
import { getStandingFoldProgress } from '../domain/geometry/foldKinematics';
import { useConfigurationStore } from './configurationStore';
import {
  findTimelinePreset,
  getTimelineState,
  PREVIEW_VIEW_MODES,
  TIMELINE_PLAY_DURATION_S,
  TIMELINE_PRESETS,
  usePreviewStore,
} from './previewStore';

const preview = () => usePreviewStore.getState();

beforeEach(() => usePreviewStore.setState({ viewMode: 'BOX', progress: TIMELINE_PRESETS.BOX, playing: false }));

describe('previewStore', () => {
  it('starts as the formed open bag (3D box)', () => {
    expect(preview().progress).toBe(0.4);
    expect(preview().viewMode).toBe('BOX');
    expect(preview().playing).toBe(false);
  });

  it('clamps the timeline to [0, 1] and ignores NaN', () => {
    preview().setProgress(0.4);
    expect(preview().progress).toBe(0.4);
    preview().setProgress(3);
    expect(preview().progress).toBe(1);
    preview().setProgress(-1);
    expect(preview().progress).toBe(0);
    preview().setProgress(Number.NaN);
    expect(preview().progress).toBe(0);
  });

  it('is not part of the configuration', () => {
    const before = useConfigurationStore.getState().configuration;
    preview().setProgress(0.8);
    preview().setViewMode('DIELINE');
    expect(useConfigurationStore.getState().configuration).toBe(before);
    expect(before).not.toHaveProperty('progress');
    expect(before).not.toHaveProperty('viewMode');
  });
});

describe('one timeline: sheet → assembly → BOX → fold → flat', () => {
  it('lists the dieline plus the four 3D presets', () => {
    expect(PREVIEW_VIEW_MODES).toEqual(['DIELINE', 'SHEET', 'BOX', 'STANDING', 'FLAT']);
  });

  it('places the presets on the 1 % grid: SHEET 0, BOX 0.4, STANDING 0.55, FLAT 1', () => {
    expect(TIMELINE_PRESETS).toEqual({ SHEET: 0, BOX: 0.4, STANDING: 0.55, FLAT: 1 });
    // STANDING is the 45° triangle preset of the fold (p ≈ 0.2497 → 0.25) on the fold part of the timeline.
    expect(getTimelineState(TIMELINE_PRESETS.STANDING).foldProgress).toBeCloseTo(0.25, 9);
    expect(Math.abs(getTimelineState(TIMELINE_PRESETS.STANDING).foldProgress - getStandingFoldProgress())).toBeLessThan(0.005);
    for (const value of Object.values(TIMELINE_PRESETS)) expect(findTimelinePreset(Math.round(value * 100) / 100)).not.toBeNull();
  });

  it('derives assembly / fold progress and the phase', () => {
    expect(getTimelineState(0)).toEqual({ assemblyProgress: 0, foldProgress: 0, phase: 'SHEET' });
    expect(getTimelineState(0.1).phase).toBe('TUBE');
    expect(getTimelineState(0.2).phase).toBe('SIDES');
    expect(getTimelineState(0.28).phase).toBe('FRONT_TRAPEZOID');
    expect(getTimelineState(0.36).phase).toBe('BACK_TRAPEZOID');
    expect(getTimelineState(0.4)).toEqual({ assemblyProgress: 1, foldProgress: 0, phase: 'FORMED' });
    expect(getTimelineState(0.41).phase).toBe('FOLD');
    expect(getTimelineState(1)).toEqual({ assemblyProgress: 1, foldProgress: 1, phase: 'FOLD' });
  });

  it('moves the timeline to the preset when a 3D mode is selected', () => {
    preview().setViewMode('SHEET');
    expect(preview()).toMatchObject({ viewMode: 'SHEET', progress: 0 });
    preview().setViewMode('FLAT');
    expect(preview()).toMatchObject({ viewMode: 'FLAT', progress: 1 });
    preview().setViewMode('STANDING');
    expect(preview()).toMatchObject({ viewMode: 'STANDING', progress: 0.55 });
  });

  it('keeps the timeline when switching to the dieline', () => {
    preview().setViewMode('FLAT');
    preview().setViewMode('DIELINE');
    expect(preview()).toMatchObject({ viewMode: 'DIELINE', progress: 1 });
    preview().setProgress(0.3);
    expect(preview().viewMode).toBe('DIELINE');
  });

  it('deselects the mode when the slider leaves a preset and reselects on an exact hit', () => {
    preview().setViewMode('FLAT');
    preview().setProgress(0.42);
    expect(preview().viewMode).toBeNull();
    preview().setProgress(55 / 100); // slider value 55 %
    expect(preview().viewMode).toBe('STANDING');
    preview().setProgress(40 / 100);
    expect(preview().viewMode).toBe('BOX');
    preview().setProgress(0);
    expect(preview().viewMode).toBe('SHEET');
  });

  it('matches presets exactly only', () => {
    expect(findTimelinePreset(1)).toBe('FLAT');
    expect(findTimelinePreset(0.56)).toBeNull();
  });
});

describe('playback', () => {
  it('plays the whole timeline and stops on FLAT', () => {
    preview().setViewMode('SHEET');
    preview().togglePlaying();
    expect(preview().playing).toBe(true);
    preview().tick(TIMELINE_PLAY_DURATION_S / 2);
    expect(preview().progress).toBeCloseTo(0.5);
    expect(preview().viewMode).toBeNull();
    preview().tick(TIMELINE_PLAY_DURATION_S);
    expect(preview()).toMatchObject({ progress: 1, playing: false, viewMode: 'FLAT' });
  });

  it('restarts from the sheet when played at the end, pauses, and stops when the slider moves', () => {
    preview().setViewMode('FLAT');
    preview().togglePlaying();
    expect(preview()).toMatchObject({ playing: true, progress: 0, viewMode: 'SHEET' });
    preview().tick(1);
    preview().togglePlaying();
    expect(preview().playing).toBe(false);
    const paused = preview().progress;
    preview().tick(1);
    expect(preview().progress).toBe(paused);
    preview().togglePlaying();
    preview().setProgress(0.2);
    expect(preview().playing).toBe(false);
  });

  it('stops when a preset is chosen', () => {
    preview().togglePlaying();
    preview().setViewMode('BOX');
    expect(preview()).toMatchObject({ playing: false, progress: 0.4 });
  });
});
