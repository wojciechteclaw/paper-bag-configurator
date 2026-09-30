import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PREVIEW_VIEW_MODES, usePreviewStore } from '../../state/previewStore';
import { revealHorizontally } from './scrollReveal';

/**
 * Segmented control for the preview modes (docs/SPEC.md §4c). Writes view state only. On narrow screens it becomes
 * a horizontally scrollable row (CSS); the active mode is kept scrolled into view.
 */
export function PreviewModeSwitcher() {
  const { t } = useTranslation();
  const viewMode = usePreviewStore((s) => s.viewMode);
  const setViewMode = usePreviewStore((s) => s.setViewMode);
  const groupRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const active = group?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (group && active) revealHorizontally(group, active);
  }, [viewMode]);

  return (
    <div ref={groupRef} className="preview-modes" role="group" aria-label={t('preview.modesLabel')}>
      {PREVIEW_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className="preview-modes__option"
          aria-pressed={viewMode === mode}
          onClick={() => setViewMode(mode)}
        >
          {t(`preview.modes.${mode}`)}
        </button>
      ))}
    </div>
  );
}
