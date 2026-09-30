import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BAG_TYPES, PANTONE_CODE_MAX_LENGTH, SWATCH_LIBRARY_RULES } from '../../domain/config/productCatalog';
import type { Lab } from '../../domain/printCoverage';
import { findNearestSwatches, type PooledSwatch } from '../../domain/swatches';
import { validatePantoneColorToAdd } from '../../domain/validation/production';
import { useConfigurationStore } from '../../state/configurationStore';
import { useSwatchLibraryStore } from '../../state/swatchLibraryStore';
import { useFormatNumber } from '../useFormatNumber';

/**
 * Nearest swatches of all imported libraries to a detected artwork colour (CIEDE2000), each with its library and a
 * one-click "add to print colours" (docs/SPEC.md §4g). Renders nothing without a library.
 */
export function SwatchSuggestions({ lab }: { lab: Lab }) {
  const swatches = useSwatchLibraryStore((s) => s.swatches);
  if (swatches.length === 0) return null;
  return <SuggestionList swatches={swatches} lab={lab} />;
}

function SuggestionList({ swatches, lab }: { swatches: readonly PooledSwatch[]; lab: Lab }) {
  const { t } = useTranslation();
  const format = useFormatNumber();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const pantoneColors = useConfigurationStore((s) => s.configuration.print.pantoneColors);
  const addPantoneColor = useConfigurationStore((s) => s.addPantoneColor);
  const { maxColors } = BAG_TYPES[productType].print;
  const matches = useMemo(
    () => findNearestSwatches(swatches, lab, SWATCH_LIBRARY_RULES.suggestionsPerColor),
    [swatches, lab],
  );

  return (
    <ul className="swatch-suggestions">
      {matches.map(({ swatch, deltaE }) => {
        const error = validatePantoneColorToAdd(pantoneColors, swatch.name, maxColors);
        const reason = error
          ? t(`swatches.errorsShort.${error}`, { max: error === 'TOO_LONG' ? PANTONE_CODE_MAX_LENGTH : maxColors })
          : undefined;
        const addLabel = t('swatches.addTo', { code: swatch.name });
        return (
          <li key={swatch.name}>
            <span className="swatch" style={{ background: swatch.hex }} aria-hidden="true" />
            <span className="swatch-suggestions__name">
              {swatch.name}
              {swatch.approximate && <abbr title={t('swatches.approximateTitle')}>{t('swatches.approximateMark')}</abbr>}
            </span>
            <small className="swatch-suggestions__library">{swatch.library}</small>
            <small className="swatch-suggestions__delta">{t('swatches.deltaE', { value: format(deltaE, 1) })}</small>
            <button
              type="button"
              className="swatch-suggestions__add"
              disabled={error !== null}
              title={reason ?? addLabel}
              aria-label={reason ? `${addLabel} — ${reason}` : addLabel}
              onClick={() => addPantoneColor(swatch.name, swatch.hex)}
            >
              {error === 'DUPLICATE' ? t('swatches.listed') : t('swatches.add')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
