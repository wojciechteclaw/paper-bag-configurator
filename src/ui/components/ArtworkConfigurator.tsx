import { useTranslation } from 'react-i18next';
import { PANEL_POSITIONS } from '../../domain/factories';
import { PanelArtworkUploader } from './PanelArtworkUploader';

export function ArtworkConfigurator() {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend>{t('artwork.label')}</legend>
      <p className="note">{t('artwork.fillNote')}</p>
      <div className="artwork-grid">
        {PANEL_POSITIONS.map((position) => (
          <PanelArtworkUploader key={position} position={position} />
        ))}
      </div>
    </fieldset>
  );
}
