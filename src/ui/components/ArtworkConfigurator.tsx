import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { getArtworkLayout, getSheetLayers, getWrapLayers, WRAP_PANEL_ORDER } from '../../domain/artworkLayout';
import { ARTWORK_LAYOUTS } from '../../domain/config/productCatalog';
import { PANEL_POSITIONS } from '../../domain/factories';
import { useConfigurationStore } from '../../state/configurationStore';
import { InkCoveragePanel } from './InkCoveragePanel';
import { PanelArtworkUploader } from './PanelArtworkUploader';
import { ArtworkLayerList } from './ArtworkLayerList';

/**
 * Graphics step: artwork layout (one artwork per wall, whole-bag layers or whole-sheet layers — docs/SPEC.md §3a–§3c), the
 * uploaders / layer list of the active layout and the live ink coverage.
 */
export function ArtworkConfigurator() {
  const { t } = useTranslation();
  const idPrefix = useId();
  const layout = useConfigurationStore((s) => getArtworkLayout(s.configuration));
  const panels = useConfigurationStore((s) => s.configuration.panels);
  const wrapLayerCount = useConfigurationStore((s) => getWrapLayers(s.configuration).length);
  const sheetLayerCount = useConfigurationStore((s) => getSheetLayers(s.configuration).length);
  const setArtworkLayout = useConfigurationStore((s) => s.setArtworkLayout);
  // Artwork of the other layout is kept (restored when switching back) but not printed — say so.
  const kept = {
    PER_PANEL: PANEL_POSITIONS.some((position) => panels[position].artwork !== null),
    WRAP: wrapLayerCount > 0,
    SHEET: sheetLayerCount > 0,
  };
  const keptLayouts = ARTWORK_LAYOUTS.filter((option) => option !== layout && kept[option]);

  return (
    <fieldset>
      <legend>{t('artwork.label')}</legend>

      <h3 id={`${idPrefix}-layout`} className="subheading">
        {t('artwork.layout.label')}
      </h3>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-layout`} className="choice-group">
        {ARTWORK_LAYOUTS.map((option) => (
          <label key={option} className="choice">
            <input
              type="radio"
              name={`${idPrefix}-layout`}
              value={option}
              checked={layout === option}
              onChange={() => setArtworkLayout(option)}
            />
            <span>{t(`artwork.layout.${option}`)}</span>
          </label>
        ))}
      </div>
      {keptLayouts.length > 0 && (
        <p className="note">
          {t('artwork.layout.kept', { layouts: keptLayouts.map((option) => t(`artwork.layout.${option}`)).join(', ') })}
        </p>
      )}

      {layout === 'WRAP' ? (
        <>
          <p className="note">
            {t('artwork.layout.wrapNote', { order: WRAP_PANEL_ORDER.map((position) => t(`artwork.${position}`)).join(' | ') })}
          </p>
          <ArtworkLayerList layout="WRAP" />
        </>
      ) : layout === 'SHEET' ? (
        <>
          <p className="note">{t('artwork.layout.sheetNote')}</p>
          <ArtworkLayerList layout="SHEET" />
        </>
      ) : (
        <>
          <p className="note">{t('artwork.fillNote')}</p>
          <div className="artwork-grid">
            {PANEL_POSITIONS.map((position) => (
              <PanelArtworkUploader key={position} position={position} />
            ))}
          </div>
        </>
      )}
      <InkCoveragePanel />
    </fieldset>
  );
}
