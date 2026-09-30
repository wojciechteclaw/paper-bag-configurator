import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigurationStore } from '../../state/configurationStore';
import { getTimelineStart, getTimelineStateFor, getTimelineStop, usePreviewStore } from '../../state/previewStore';

/** Drives a running playback: advances the preview timeline every animation frame while `playing`. */
function usePlayback() {
  const playing = usePreviewStore((s) => s.playing);
  const tick = usePreviewStore((s) => s.tick);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number) => {
      if (last !== null) tick(Math.min(0.1, (now - last) / 1000));
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, tick]);
}

/**
 * The 3D timeline slider 0–100 % (docs/SPEC.md §4a/§4c): flat sheet → assembly (tube, side triangles, front flap,
 * back flap) → formed open bag (40 %) → standing → folded flat. Shows the current stage and a play / pause button that
 * animates the whole timeline. Writes view state only (previewStore), never the configuration.
 */
export function FoldSlider() {
  const { t } = useTranslation();
  const id = useId();
  const progress = usePreviewStore((s) => s.progress);
  const playing = usePreviewStore((s) => s.playing);
  const setProgress = usePreviewStore((s) => s.setProgress);
  const togglePlaying = usePreviewStore((s) => s.togglePlaying);
  const skip = usePreviewStore((s) => s.skip);
  // The gusseted bag has no sheet assembly: its timeline (slider, playback, stage stops) starts at the formed open bag.
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const timelineStart = getTimelineStart(productType);
  usePlayback();
  const percent = Math.round(progress * 100);
  const phase = getTimelineStateFor(productType, progress).phase;

  return (
    <div className="fold-slider">
      <button
        type="button"
        className="fold-slider__skip"
        aria-label={t('preview.previousStage')}
        title={t('preview.previousStage')}
        disabled={getTimelineStop(progress, -1, timelineStart) === null}
        onClick={() => skip(-1, timelineStart)}
      >
        <span aria-hidden="true">⏮</span>
      </button>
      <button
        type="button"
        className="fold-slider__play"
        aria-pressed={playing}
        aria-label={playing ? t('preview.pause') : t('preview.play')}
        title={playing ? t('preview.pause') : t('preview.play')}
        onClick={() => togglePlaying(timelineStart)}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>
      <button
        type="button"
        className="fold-slider__skip"
        aria-label={t('preview.nextStage')}
        title={t('preview.nextStage')}
        disabled={getTimelineStop(progress, 1, timelineStart) === null}
        onClick={() => skip(1, timelineStart)}
      >
        <span aria-hidden="true">⏭</span>
      </button>
      <label htmlFor={id}>{t('preview.fold')}</label>
      <input
        id={id}
        type="range"
        min={Math.round(timelineStart * 100)}
        max={100}
        step={1}
        value={percent}
        aria-valuetext={`${percent} % — ${t(`preview.phase.${phase}`)}`}
        onChange={(e) => setProgress(Number(e.target.value) / 100)}
      />
      <output htmlFor={id}>{percent} %</output>
      <span className="fold-slider__phase" aria-live="off">
        {t(`preview.phase.${phase}`)}
      </span>
    </div>
  );
}
