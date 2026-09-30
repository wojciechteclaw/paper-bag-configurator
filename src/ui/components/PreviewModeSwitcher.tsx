import { useTranslation } from 'react-i18next';
import { useConfigurationStore } from '../../state/configurationStore';
import { getPreviewViewModes, usePreviewStore } from '../../state/previewStore';

/** Segmented control for the preview modes (docs/SPEC.md §4c). Writes view state only. */
export function PreviewModeSwitcher() {
  const { t } = useTranslation();
  const viewMode = usePreviewStore((s) => s.viewMode);
  const setViewMode = usePreviewStore((s) => s.setViewMode);
  const productType = useConfigurationStore((s) => s.configuration.productType);

  return (
    <div className="preview-modes" role="group" aria-label={t('preview.modesLabel')}>
      {getPreviewViewModes(productType).map((mode) => (
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
