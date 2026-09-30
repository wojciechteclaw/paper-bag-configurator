import { useTranslation } from 'react-i18next';
import { usePreviewStore } from '../../state/previewStore';

/**
 * Toggle over the 3D canvas: the camera circles the bag (360°, from 45° above to 45° below). Writes view state only;
 * a drag / pinch on the canvas stops it (the renderer reports that back through PreviewPanel).
 */
export function OrbitButton() {
  const { t } = useTranslation();
  const orbiting = usePreviewStore((s) => s.orbiting);
  const toggleOrbiting = usePreviewStore((s) => s.toggleOrbiting);
  const label = orbiting ? t('preview.orbitStop') : t('preview.orbit');

  return (
    <button
      type="button"
      className="preview-orbit"
      aria-pressed={orbiting}
      aria-label={label}
      title={label}
      onClick={() => toggleOrbiting()}
    >
      <span aria-hidden="true">{orbiting ? '❚❚' : '⟳'}</span> 360°
    </button>
  );
}
