import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BagConfiguration } from '../../domain/types';
import type { ExportProgress } from '../export/exportConfiguration';

type ExportKind = 'pdf' | 'xlsx';
type Status = { kind: 'idle' } | { kind: 'busy'; target: ExportKind; progress: ExportProgress | null } | { kind: 'done' } | { kind: 'error' };

/** "Download PDF" / "Download Excel" of the Summary step (docs/SPEC.md §4e). Generators are loaded on click. */
export function ExportActions({ configuration }: { configuration: BagConfiguration }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';

  const run = async (target: ExportKind) => {
    setStatus({ kind: 'busy', target, progress: null });
    const onProgress = (progress: ExportProgress) => setStatus({ kind: 'busy', target, progress });
    const context = { t: t as (key: string, options?: Record<string, unknown>) => string, language: i18n.resolvedLanguage ?? i18n.language };
    try {
      const exporter = await import('../export/exportConfiguration');
      if (target === 'pdf') await exporter.exportProductSheetPdf(configuration, context, onProgress);
      else await exporter.exportWorkbook(configuration, context, onProgress);
      setStatus({ kind: 'done' });
    } catch (error) {
      console.error('Export failed', error);
      setStatus({ kind: 'error' });
    }
  };

  const progressText = (progress: ExportProgress | null) => {
    if (!progress || progress.phase === 'coverage') return t('export.actions.progress.coverage');
    if (progress.phase === 'views') return t('export.actions.progress.views', { done: progress.done, total: progress.total });
    return t('export.actions.progress.document');
  };

  return (
    <fieldset>
      <legend>{t('export.actions.legend')}</legend>
      <p className="note">{t('export.actions.intro')}</p>
      <div className="json-actions">
        <button type="button" onClick={() => void run('pdf')} disabled={busy} aria-busy={busy && status.target === 'pdf'}>
          {t('export.actions.pdf')}
        </button>
        <button type="button" onClick={() => void run('xlsx')} disabled={busy} aria-busy={busy && status.target === 'xlsx'}>
          {t('export.actions.xlsx')}
        </button>
        <span aria-live="polite" className="note" data-testid="export-status">
          {status.kind === 'busy' && progressText(status.progress)}
          {status.kind === 'done' && t('export.actions.done')}
        </span>
      </div>
      {status.kind === 'error' && (
        <p role="alert" className="error">
          {t('export.actions.error')}
        </p>
      )}
    </fieldset>
  );
}
