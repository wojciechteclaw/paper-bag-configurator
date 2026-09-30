import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ARTWORK_PALETTE_RULES, COLOR_ANALYSIS_LIMITS } from '../../domain/config/productCatalog';
import { createNumberFormatter } from '../../i18n/numberFormat';
import { normalizeColorAnalysis, type ArtworkPaletteResult, type InkCoverageResult } from '../../domain/printCoverage';
import { useConfigurationStore } from '../../state/configurationStore';
import { useSwatchLibraryStore } from '../../state/swatchLibraryStore';
import { useInkCoverage } from '../coverage/useInkCoverage';
import { SwatchSuggestions } from '../swatches/SwatchSuggestions';

const MM2_PER_CM2 = 100;

/** Ink coverage estimate of the whole sheet, with a bar per Pantone colour (docs/SPEC.md §4d). */
export function InkCoveragePanel() {
  const { t } = useTranslation();
  const id = useId();
  const state = useInkCoverage();
  const result = state.status === 'empty' ? null : state.result;
  const palette = state.status === 'empty' ? null : state.palette;

  return (
    <section className="coverage" aria-labelledby={`${id}-title`} aria-busy={state.status === 'computing'}>
      <h3 className="subheading" id={`${id}-title`}>
        {t('coverage.title')}
        {state.status === 'computing' && <small> {t('coverage.computing')}</small>}
      </h3>
      {state.status === 'empty' ? (
        <p className="note">{t('coverage.empty')}</p>
      ) : result ? (
        <CoverageDetails result={result} />
      ) : null}
      {palette && <ArtworkColorsTable palette={palette} />}
      {state.status === 'ready' && state.unavailablePanels.length > 0 && (
        <small className="warning">
          {t('coverage.unavailable', { panels: state.unavailablePanels.map((p) => t(`artwork.${p}`)).join(', ') })}
        </small>
      )}
      <p className="note">{t('coverage.estimateNote')}</p>
    </section>
  );
}

function CoverageDetails({ result }: { result: InkCoverageResult }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const percent = (ratio: number) =>
    createNumberFormatter(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })(ratio);
  const cm2 = (area: number) => createNumberFormatter(locale, { maximumFractionDigits: 0 })(area / MM2_PER_CM2);

  const rows = result.colors.map((color) => ({ key: color.code, label: color.code, hex: color.hex, ratio: color.sheetRatio }));
  if (result.unassignedArea > 0) {
    rows.push({ key: '__unassigned', label: t('coverage.unassigned'), hex: '', ratio: result.unassignedSheetRatio });
  }

  return (
    <>
      <p className="coverage__total" aria-live="polite">
        <span>{t('coverage.total')}</span> <strong>{percent(result.sheetRatio)}</strong>{' '}
        <small>{t('coverage.ofSheet', { ink: cm2(result.inkArea), sheet: cm2(result.sheetArea) })}</small>
      </p>
      <CoverageBar ratio={result.sheetRatio} label={t('coverage.total')} />
      {rows.length > 0 && (
        <ul className="coverage__list" aria-label={t('coverage.perColor')}>
          {rows.map((row) => (
            <li key={row.key} className="coverage__row">
              <span
                className={row.hex ? 'swatch' : 'swatch swatch--unassigned'}
                style={row.hex ? { background: row.hex } : undefined}
                aria-hidden="true"
              />
              <span className="coverage__code">{row.label}</span>
              <CoverageBar ratio={row.ratio} label={row.label} color={row.hex || undefined} />
              <span className="coverage__value">{percent(row.ratio)}</span>
            </li>
          ))}
        </ul>
      )}
      {result.hints.map((hint) => (
        <small key={hint} className="warning">
          {t(`coverage.hints.${hint}`)}
        </small>
      ))}
    </>
  );
}

/** Colours detected in the placed artwork (HEX), largest area first, with the nearest listed Pantone. */
function ArtworkColorsTable({ palette }: { palette: ArtworkPaletteResult }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const percent = (ratio: number) =>
    createNumberFormatter(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })(ratio);
  const cm2 = (area: number) => createNumberFormatter(locale, { maximumFractionDigits: 1 })(area / MM2_PER_CM2);
  const deltaE = (value: number) => createNumberFormatter(locale, { maximumFractionDigits: 1 })(value);
  const share = (ratio: number) => createNumberFormatter(locale, { style: 'percent', maximumFractionDigits: 2 })(ratio);
  // Imported swatch library (docs/SPEC.md §4g): an extra column with the nearest library swatches.
  const hasLibrary = useSwatchLibraryStore((s) => s.libraries.length > 0);
  const libraryColumns = hasLibrary ? 1 : 0;

  return (
    <details className="coverage__palette">
      <summary>
        {t('coverage.palette.title')} <small>({palette.colors.length})</small>
      </summary>
      <ColorMergeControls palette={palette} />
      {palette.colors.length === 0 ? (
        <p className="note">{t('coverage.palette.empty')}</p>
      ) : (
        // Scrolls sideways on narrow screens instead of widening the page; focusable so it scrolls from the keyboard.
        <div className="coverage__table-scroll" role="region" aria-label={t('coverage.palette.title')} tabIndex={0}>
          <table className="coverage__table">
            <thead>
              <tr>
                <th scope="col">{t('coverage.palette.swatch')}</th>
                <th scope="col">{t('coverage.palette.hex')}</th>
                <th scope="col">{t('coverage.palette.pantone')}</th>
                {hasLibrary && <th scope="col">{t('swatches.nearest')}</th>}
                <th scope="col" className="num">
                  {t('coverage.palette.area', { unit: 'cm²' })}
                </th>
                <th scope="col" className="num">
                  {t('coverage.palette.percent')}
                </th>
              </tr>
            </thead>
            <tbody>
              {palette.colors.map((color) => (
                <tr key={color.hex}>
                  <td>
                    <span className="swatch" style={{ background: color.hex }} aria-hidden="true" />
                  </td>
                  <td className="mono">{color.hex}</td>
                  <td>{color.pantone ? `${color.pantone.code} (ΔE ${deltaE(color.pantone.deltaE)})` : '—'}</td>
                  {hasLibrary && (
                    <td>
                      <SwatchSuggestions lab={color.lab} />
                    </td>
                  )}
                  <td className="num">{cm2(color.area)}</td>
                  <td className="num">{percent(color.sheetRatio)}</td>
                </tr>
              ))}
              {palette.other.area > 0 && (
                <tr>
                  <td>
                    <span className="swatch swatch--unassigned" aria-hidden="true" />
                  </td>
                  <td colSpan={2 + libraryColumns}>{t('coverage.palette.other', { count: palette.other.colorCount })}</td>
                  <td className="num">{cm2(palette.other.area)}</td>
                  <td className="num">{percent(palette.other.sheetRatio)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3 + libraryColumns}>
                  {t('coverage.total')}
                </th>
                <td className="num">{cm2(palette.inkArea)}</td>
                <td className="num">{percent(palette.sheetRatio)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="note">
        {t('coverage.palette.note', {
          tolerance: deltaE(palette.settings.mergeTolerance),
          minShare: share(palette.settings.minAreaShare),
          max: ARTWORK_PALETTE_RULES.maxColors,
        })}
      </p>
    </details>
  );
}

/**
 * "Łączenie podobnych kolorów": merge tolerance (ΔE00) and minimum colour spot, stored in the configuration
 * (`print.colorAnalysis`) so the exports match; the palette recomputes live (debounced in `useInkCoverage`).
 */
function ColorMergeControls({ palette }: { palette: ArtworkPaletteResult }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const stored = useConfigurationStore((s) => s.configuration.print.colorAnalysis);
  const setColorAnalysis = useConfigurationStore((s) => s.setColorAnalysis);
  const settings = normalizeColorAnalysis(stored);
  const { min, max, step } = COLOR_ANALYSIS_LIMITS.mergeTolerance;
  const options = [...new Set([...COLOR_ANALYSIS_LIMITS.minAreaShareOptions, settings.minAreaShare])].sort((a, b) => a - b);
  const share = (ratio: number) => createNumberFormatter(locale, { style: 'percent', maximumFractionDigits: 2 })(ratio);
  const toleranceText = t('coverage.analysis.toleranceValue', { value: settings.mergeTolerance });

  return (
    <div className="coverage__merge">
      <label htmlFor={`${id}-tolerance`}>{t('coverage.analysis.tolerance')}</label>
      <div className="coverage__merge-slider">
        <small aria-hidden="true">{t('coverage.analysis.exact')}</small>
        <input
          id={`${id}-tolerance`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={settings.mergeTolerance}
          aria-valuetext={toleranceText}
          onChange={(e) => setColorAnalysis({ mergeTolerance: Number(e.target.value) })}
        />
        <small aria-hidden="true">{t('coverage.analysis.strong')}</small>
        <output htmlFor={`${id}-tolerance`}>{toleranceText}</output>
      </div>
      <label className="coverage__merge-min">
        {t('coverage.analysis.minShare')}{' '}
        <select
          value={String(settings.minAreaShare)}
          onChange={(e) => setColorAnalysis({ minAreaShare: Number(e.target.value) })}
        >
          {options.map((option) => (
            <option key={option} value={String(option)}>
              {option === 0 ? t('coverage.analysis.minShareNone') : t('coverage.analysis.minShareOption', { value: share(option) })}
            </option>
          ))}
        </select>
      </label>
      {palette.rawColorCount > 0 && (
        <p className="coverage__merge-result" aria-live="polite">
          {t('coverage.analysis.merged', {
            count: palette.colors.length,
            shades: t('coverage.analysis.shades', { count: palette.rawColorCount }),
          })}
        </p>
      )}
      <small className="note">{t('coverage.analysis.hint')}</small>
    </div>
  );
}

function CoverageBar({ ratio, label, color }: { ratio: number; label: string; color?: string }) {
  const value = Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10;
  return (
    <span
      className="coverage__bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span className="coverage__fill" style={{ width: `${value}%`, ...(color ? { background: color } : {}) }} />
    </span>
  );
}
