import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { InkCoverageResult } from '../../domain/printCoverage';
import { useInkCoverage } from '../coverage/useInkCoverage';

const MM2_PER_CM2 = 100;

/** Ink coverage estimate of the whole sheet, with a bar per Pantone colour (docs/SPEC.md §4d). */
export function InkCoveragePanel() {
  const { t } = useTranslation();
  const id = useId();
  const state = useInkCoverage();
  const result = state.status === 'empty' ? null : state.result;

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
    new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ratio);
  const cm2 = (area: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(area / MM2_PER_CM2);

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
