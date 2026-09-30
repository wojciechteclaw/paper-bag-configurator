import { beforeEach, describe, expect, it } from 'vitest';
import { useConfigurationStore } from '../../src/state/configurationStore';
import {
  findTimelinePreset,
  getTimelinePresets,
  getTimelineState,
  getTimelineStops,
  getTimelineStop,
  getTimelineStateFor,
  PREVIEW_VIEW_MODES,
  TIMELINE_PLAY_DURATION_S,
  TIMELINE_PRESETS,
  TIMELINE_STOPS,
  usePreviewStore,
} from '../../src/state/previewStore';

const preview = () => usePreviewStore.getState();

beforeEach(() => {
  useConfigurationStore.getState().resetConfiguration('BLOCK');
  usePreviewStore.setState({ viewMode: 'BOX', progress: TIMELINE_PRESETS.BOX, playing: false });
});

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

  it('places the presets on the 1 % grid: SHEET 0, BOX 0.4, STANDING 0.45 (client [K]), FLAT 1', () => {
    expect(TIMELINE_PRESETS).toEqual({ SHEET: 0, BOX: 0.4, STANDING: 0.45, FLAT: 1 });
    // STANDING is early in the fold part of the timeline: p = 0.05 / 0.6.
    expect(getTimelineState(TIMELINE_PRESETS.STANDING).foldProgress).toBeCloseTo(1 / 12, 9);
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
    expect(preview()).toMatchObject({ viewMode: 'STANDING', progress: 0.45 });
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
    preview().setProgress(45 / 100); // slider value 45 %
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

describe('chapter skip (previous / next stage)', () => {
  it('stops at every assembly phase start and every 3D preset', () => {
    expect(TIMELINE_STOPS).toEqual([0, 0.16, 0.24, 0.32, 0.4, 0.45, 1]);
  });

  it('finds the next / previous stop, also from between stops, and null at the ends', () => {
    expect(getTimelineStop(0, 1)).toBe(0.16);
    expect(getTimelineStop(0.2, 1)).toBe(0.24);
    expect(getTimelineStop(0.2, -1)).toBe(0.16);
    expect(getTimelineStop(0.4, -1)).toBe(0.32);
    expect(getTimelineStop(1, 1)).toBeNull();
    expect(getTimelineStop(0, -1)).toBeNull();
  });

  it('skip moves the timeline, selects the preset it lands on and stops playback', () => {
    usePreviewStore.setState({ playing: true });
    preview().skip(1);
    expect(preview()).toMatchObject({ progress: 0.45, viewMode: 'STANDING', playing: false });
    preview().skip(-1);
    preview().skip(-1);
    expect(preview()).toMatchObject({ progress: 0.32, viewMode: null });
    preview().setProgress(1);
    preview().skip(1);
    expect(preview().progress).toBe(1);
  });

});

describe('gusseted bag timeline (FOLDED): forming 0–60 %, then the fold', () => {
  beforeEach(() => {
    useConfigurationStore.getState().resetConfiguration('FOLDED');
    usePreviewStore.setState({ viewMode: 'SHEET', progress: 0, playing: false });
  });

  it('maps its own presets: sheet 0, open bag 0.6, STANDING 0.75 (client), flat 1 — the block bottom unchanged', () => {
    expect(getTimelinePresets('FOLDED')).toEqual({ SHEET: 0, BOX: 0.6, STANDING: 0.75, FLAT: 1 });
    expect(getTimelinePresets('BLOCK')).toBe(TIMELINE_PRESETS);
    expect(TIMELINE_PRESETS).toEqual({ SHEET: 0, BOX: 0.4, STANDING: 0.45, FLAT: 1 });
    preview().setViewMode('BOX');
    expect(preview().progress).toBe(0.6);
    preview().setViewMode('FLAT');
    expect(preview().progress).toBe(1);
    preview().setViewMode('SHEET');
    expect(preview().progress).toBe(0);
    preview().setProgress(0.75);
    expect(preview().viewMode).toBe('STANDING');
    expect(findTimelinePreset(0.4, 'FOLDED')).toBeNull();
  });

  it('derives forming / fold progress and the stage (PL labels per phase)', () => {
    expect(getTimelineStateFor('FOLDED', 0)).toEqual({ assemblyProgress: 0, foldProgress: 0, phase: 'SHEET' });
    expect(getTimelineStateFor('FOLDED', 0.1).phase).toBe('GUSSET_TUCK');
    expect(getTimelineStateFor('FOLDED', 0.2).phase).toBe('GUSSET_WRAP');
    expect(getTimelineStateFor('FOLDED', 0.35).phase).toBe('GUSSET_BOTTOM');
    expect(getTimelineStateFor('FOLDED', 0.5).phase).toBe('GUSSET_OPEN');
    expect(getTimelineStateFor('FOLDED', 0.6)).toEqual({ assemblyProgress: 1, foldProgress: 0, phase: 'FORMED' });
    expect(getTimelineStateFor('FOLDED', 0.8)).toMatchObject({ assemblyProgress: 1, phase: 'FOLD' });
    expect(getTimelineStateFor('FOLDED', 0.8).foldProgress).toBeCloseTo(0.5, 9);
    expect(getTimelineStateFor('FOLDED', 1)).toEqual({ assemblyProgress: 1, foldProgress: 1, phase: 'FOLD' });
    expect(getTimelineStateFor('BLOCK', 0.2)).toEqual(getTimelineState(0.2));
  });

  it('skips over its forming phase starts and presets: 0, 0.15, 0.3, 0.45, 0.6, 0.75, 1', () => {
    expect(getTimelineStops('FOLDED')).toEqual([0, 0.15, 0.3, 0.45, 0.6, 0.75, 1]);
    expect(getTimelineStops('BLOCK')).toBe(TIMELINE_STOPS);
    expect(getTimelineStop(0, 1, 'FOLDED')).toBe(0.15);
    expect(getTimelineStop(0.5, -1, 'FOLDED')).toBe(0.45);
    expect(getTimelineStop(0, -1, 'FOLDED')).toBeNull();
    for (let i = 0; i < 4; i++) preview().skip(1);
    expect(preview()).toMatchObject({ progress: 0.6, viewMode: 'BOX' });
    preview().skip(1);
    expect(preview()).toMatchObject({ progress: 0.75, viewMode: 'STANDING' });
  });

  it('plays from the sheet and ends folded flat', () => {
    preview().setViewMode('FLAT');
    preview().togglePlaying();
    expect(preview()).toMatchObject({ playing: true, progress: 0, viewMode: 'SHEET' });
    preview().tick(TIMELINE_PLAY_DURATION_S);
    expect(preview()).toMatchObject({ playing: false, progress: 1, viewMode: 'FLAT' });
  });

  it('keeps a selected preset when the bag type changes (the timeline value follows the type)', () => {
    preview().setViewMode('BOX');
    expect(preview().progress).toBe(0.6);
    useConfigurationStore.getState().setProductType('BLOCK');
    expect(preview()).toMatchObject({ viewMode: 'BOX', progress: 0.4 });
    preview().setViewMode('STANDING');
    useConfigurationStore.getState().setProductType('FOLDED');
    expect(preview()).toMatchObject({ viewMode: 'STANDING', progress: 0.75 });
    preview().setProgress(0.33);
    useConfigurationStore.getState().setProductType('BLOCK');
    expect(preview()).toMatchObject({ viewMode: null, progress: 0.33 });
    useConfigurationStore.getState().resetConfiguration('BLOCK');
  });
});
