import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreviewStore } from '../../state/previewStore';

/** "Fold" slider 0–100 % for the 3D preview. Writes view state only (previewStore), never the configuration. */
export function FoldSlider() {
  const { t } = useTranslation();
  const id = useId();
  const foldProgress = usePreviewStore((s) => s.foldProgress);
  const setFoldProgress = usePreviewStore((s) => s.setFoldProgress);
  const percent = Math.round(foldProgress * 100);

  return (
    <div className="fold-slider">
      <label htmlFor={id}>{t('preview.fold')}</label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-valuetext={`${percent} %`}
        onChange={(e) => setFoldProgress(Number(e.target.value) / 100)}
      />
      <output htmlFor={id}>{percent} %</output>
    </div>
  );
}
