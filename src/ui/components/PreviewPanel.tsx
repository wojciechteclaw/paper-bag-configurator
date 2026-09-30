import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DielineView } from '../../dieline/DielineView';
import { BagPreview3D } from '../../renderer/BagPreview3D';
import { useConfigurationStore } from '../../state/configurationStore';
import { getTimelineStateFor, is3DViewMode, usePreviewStore } from '../../state/previewStore';
import { COLLAPSIBLE_PREVIEW_QUERY, useMediaQuery } from '../useMediaQuery';
import { FoldSlider } from './FoldSlider';
import { OrbitButton } from './OrbitButton';
import { PreviewModeSwitcher } from './PreviewModeSwitcher';

/**
 * Preview area: mode switcher (dieline / sheet / 3D box / 3D standing / flat), the 2D dieline or the 3D canvas, and —
 * in 3D only — the timeline slider (assembly from the sheet, then the fold) with play / pause and the camera orbit
 * button. Reads the configuration and the view-only preview state and passes them to the renderer as props.
 *
 * Phones / tablets in portrait can collapse it to a bar (more room for the form); the collapsed state only applies
 * there, so it never hides the preview on desktop or in landscape.
 */
export function PreviewPanel() {
  const { t } = useTranslation();
  const configuration = useConfigurationStore((s) => s.configuration);
  const progress = usePreviewStore((s) => s.progress);
  const viewMode = usePreviewStore((s) => s.viewMode);
  const orbiting = usePreviewStore((s) => s.orbiting);
  const stopOrbiting = usePreviewStore((s) => s.stopOrbiting);
  const collapsible = useMediaQuery(COLLAPSIBLE_PREVIEW_QUERY);
  const collapsed = usePreviewStore((s) => s.collapsed) && collapsible;
  const toggleCollapsed = usePreviewStore((s) => s.toggleCollapsed);
  const viewId = useId();
  const show3D = is3DViewMode(viewMode);
  const { assemblyProgress, foldProgress } = getTimelineStateFor(configuration.productType, progress);

  if (collapsed) {
    return (
      <div className="preview-stage is-collapsed">
        <button type="button" className="preview-expand" aria-expanded={false} onClick={toggleCollapsed}>
          <span aria-hidden="true">▾</span> {t('preview.expand')}
        </button>
      </div>
    );
  }

  return (
    <div className="preview-stage">
      {/* Desktop: fills the stage under the floating controls; narrow screens: between them (index.css). */}
      <div className="preview-stage__view" id={viewId}>
        {show3D ? (
          <>
            <BagPreview3D
              configuration={configuration}
              foldProgress={foldProgress}
              assemblyProgress={assemblyProgress}
              autoOrbit={orbiting}
              onAutoOrbitEnd={stopOrbiting}
            />
            <OrbitButton />
          </>
        ) : (
          <DielineView />
        )}
        {collapsible && (
          <button
            type="button"
            className="preview-collapse"
            aria-expanded={true}
            aria-controls={viewId}
            aria-label={t('preview.collapse')}
            title={t('preview.collapse')}
            onClick={toggleCollapsed}
          >
            <span aria-hidden="true">▴</span>
          </button>
        )}
      </div>
      <div className="preview-stage__top">
        <PreviewModeSwitcher />
      </div>
      {show3D && (
        <div className="preview-stage__overlay">
          <FoldSlider />
        </div>
      )}
    </div>
  );
}
