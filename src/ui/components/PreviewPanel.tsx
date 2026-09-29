import { BagPreview3D } from '../../renderer/BagPreview3D';
import { useConfigurationStore } from '../../state/configurationStore';
import { usePreviewStore } from '../../state/previewStore';
import { FoldSlider } from './FoldSlider';

/** 3D preview with the fold slider overlaid. Reads the configuration and the view-only fold state. */
export function PreviewPanel() {
  const configuration = useConfigurationStore((s) => s.configuration);
  const foldProgress = usePreviewStore((s) => s.foldProgress);

  return (
    <div className="preview-stage">
      <BagPreview3D configuration={configuration} foldProgress={foldProgress} />
      <div className="preview-stage__overlay">
        <FoldSlider />
      </div>
    </div>
  );
}
