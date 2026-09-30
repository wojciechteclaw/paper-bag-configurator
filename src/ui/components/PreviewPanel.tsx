import { DielineView } from '../../dieline/DielineView';
import { BagPreview3D } from '../../renderer/BagPreview3D';
import { useConfigurationStore } from '../../state/configurationStore';
import { getTimelineStateFor, is3DViewMode, usePreviewStore } from '../../state/previewStore';
import { FoldSlider } from './FoldSlider';
import { PreviewModeSwitcher } from './PreviewModeSwitcher';

/**
 * Preview area: mode switcher (dieline / sheet / 3D box / 3D standing / flat), the 2D dieline or the 3D canvas, and —
 * in 3D only — the timeline slider (assembly from the sheet, then the fold) with play / pause. Reads the configuration
 * and the view-only preview state and passes them to the renderer as props.
 */
export function PreviewPanel() {
  const configuration = useConfigurationStore((s) => s.configuration);
  const progress = usePreviewStore((s) => s.progress);
  const viewMode = usePreviewStore((s) => s.viewMode);
  const show3D = is3DViewMode(viewMode);
  const { assemblyProgress, foldProgress } = getTimelineStateFor(configuration.productType, progress);

  return (
    <div className="preview-stage">
      {show3D ? (
        <BagPreview3D configuration={configuration} foldProgress={foldProgress} assemblyProgress={assemblyProgress} />
      ) : (
        <DielineView />
      )}
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
