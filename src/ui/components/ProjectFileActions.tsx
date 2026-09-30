import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PROJECT_FILE_RULES } from '../../domain/config/productCatalog';
import { isProjectFileError, type ParsedProject, type ProjectFileErrorCode } from '../../domain/project';
import { applyProject, exportProject, hasUnsavedChanges, readProjectFile } from '../../state/projectFile';
import { ConfirmDialog } from './ConfirmDialog';
import { useHeaderMenu } from './headerMenuContext';

// "Zapisz projekt" / "Wczytaj projekt" (docs/SPEC.md §4h): the whole project (configuration + artwork files) to and
// from one `.bagproj` file.

type SaveMessage = { kind: 'saved'; fileName: string } | { kind: 'saveError'; code: ProjectFileErrorCode | null; detail?: string };
type LoadMessage =
  | { kind: 'loaded'; fileName: string; project: ParsedProject }
  | { kind: 'loadError'; code: ProjectFileErrorCode | null; detail?: string };
type Message = SaveMessage | LoadMessage;

// Local copy of the dieline's `downloadBlob`: importing that module here would pull the lazily loaded SVG export into
// the main bundle.
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const errorInfo = (error: unknown) =>
  isProjectFileError(error) ? { code: error.code, detail: error.detail } : { code: null, detail: undefined };

/** Saving the current project as a download; shared by the header and the Summary step. */
function useSaveProject(onMessage: (message: SaveMessage) => void) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const { blob, fileName } = await exportProject({ fileNamePrefix: t('project.fileNamePrefix') });
      downloadBlob(blob, fileName);
      onMessage({ kind: 'saved', fileName });
    } catch (error) {
      console.error('Project export failed', error);
      onMessage({ kind: 'saveError', ...errorInfo(error) });
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

function MessageText({ message }: { message: Message }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  switch (message.kind) {
    case 'saved':
      return <>{t('project.saved', { fileName: message.fileName })}</>;
    case 'saveError':
      return <>{t(`project.saveErrors.${message.code === 'MISSING_FILE' || message.code === 'TOO_LARGE' || message.code === 'TOO_MANY_FILES' ? message.code : 'generic'}`, { detail: message.detail ?? '' })}</>;
    case 'loadError':
      return <>{t(`project.loadErrors.${message.code ?? 'generic'}`, { detail: message.detail ?? '' })}</>;
    case 'loaded': {
      const { project, fileName } = message;
      const sections = [...new Set(project.adjustments.map((adjustment) => adjustment.section))];
      const savedAt = project.exportedAt
        ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(project.exportedAt)
        : null;
      return (
        <>
          {savedAt ? t('project.loadedAt', { fileName, date: savedAt }) : t('project.loaded', { fileName })}
          {project.warnings.map((warning) => (
            <span key={warning} className="project-message__detail">
              {t(`project.warnings.${warning}`)}
            </span>
          ))}
          {sections.length > 0 && (
            <span className="project-message__detail">
              {t('project.adjusted', { sections: sections.map((section) => t(`project.sections.${section}`)).join(', ') })}
            </span>
          )}
        </>
      );
    }
  }
}

function ProjectMessage({ message, onDismiss }: { message: Message | null; onDismiss?: () => void }) {
  const { t } = useTranslation();
  const isError = message?.kind === 'saveError' || message?.kind === 'loadError';
  const hasNotes = message?.kind === 'loaded' && (message.project.warnings.length > 0 || message.project.adjustments.length > 0);
  return (
    // Both live regions stay mounted so screen readers announce changes.
    <div className="project-message-slot">
      <div role="alert" className={isError ? 'project-message project-message--error' : undefined}>
        {isError && message && <MessageText message={message} />}
        {isError && onDismiss && <DismissButton label={t('project.dismiss')} onClick={onDismiss} />}
      </div>
      <div role="status" className={!isError && message ? `project-message${hasNotes ? ' project-message--warning' : ''}` : undefined}>
        {!isError && message && <MessageText message={message} />}
        {!isError && message && onDismiss && <DismissButton label={t('project.dismiss')} onClick={onDismiss} />}
      </div>
    </div>
  );
}

function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="project-message__dismiss" aria-label={label} title={label} onClick={onClick}>
      ×
    </button>
  );
}

/** Header actions: save the project, load a project (with a confirmation when there are unsaved changes). */
export function ProjectFileActions() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const menu = useHeaderMenu();
  const [pending, setPending] = useState<{ project: ParsedProject; fileName: string } | null>(null);
  const { save, saving } = useSaveProject(setMessage);
  const busy = saving || loading;

  const apply = (project: ParsedProject, fileName: string) => {
    applyProject(project);
    setMessage({ kind: 'loaded', fileName, project });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // choosing the same file again must fire a change
    if (!file) return;
    setLoading(true);
    setMessage(null);
    try {
      const project = await readProjectFile(file);
      if (hasUnsavedChanges()) setPending({ project, fileName: file.name });
      else apply(project, file.name);
    } catch (error) {
      console.warn('Project could not be loaded', error);
      setMessage({ kind: 'loadError', ...errorInfo(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="project-actions">
      <div className="project-actions__buttons">
        {/* In the mobile header menu both actions close it: the result shows as a toast, the confirmation as a dialog. */}
        <button
          type="button"
          className="header-button"
          onClick={() => {
            menu.close();
            void save();
          }}
          disabled={busy}
          aria-busy={saving}
          title={t('project.saveHint')}
        >
          {saving ? t('project.saving') : t('project.save')}
        </button>
        <button
          type="button"
          className="header-button"
          onClick={() => {
            menu.close();
            inputRef.current?.click();
          }}
          disabled={busy}
          aria-busy={loading}
          title={t('project.loadHint')}
        >
          {loading ? t('project.loading') : t('project.load')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={PROJECT_FILE_RULES.accept}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="project-file-input"
          onChange={(event) => void onFile(event)}
        />
      </div>
      <ProjectMessage message={message} onDismiss={() => setMessage(null)} />
      {pending && (
        <ConfirmDialog
          title={t('project.confirm.title')}
          confirmLabel={t('project.confirm.confirm')}
          cancelLabel={t('project.confirm.cancel')}
          onConfirm={() => {
            apply(pending.project, pending.fileName);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        >
          <p>{t('project.confirm.body', { fileName: pending.fileName })}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** "Zapisz projekt" of the Summary step (the portable replacement of the plain JSON download). */
export function SaveProjectButton() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<SaveMessage | null>(null);
  const { save, saving } = useSaveProject(setMessage);
  return (
    <>
      <button type="button" onClick={() => void save()} disabled={saving} aria-busy={saving}>
        {saving ? t('project.saving') : t('project.saveWithExtension', { extension: PROJECT_FILE_RULES.extension })}
      </button>
      <ProjectMessage message={message} />
    </>
  );
}
