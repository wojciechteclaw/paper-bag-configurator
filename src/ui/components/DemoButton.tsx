import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { demoFolder, loadDemoConfiguration } from '../demo/demoConfiguration';
import { useHeaderMenu } from './headerMenuContext';

type DemoButtonProps = {
  /** Demo number: loads `public/demo<index>/config.json` and its images (client, 30.09.2026). */
  index: number;
};

type DemoState = { status: 'idle' | 'busy' | 'error' | 'partial'; missing?: string[] };

/**
 * Loads one demo folder. Missing demo images are skipped; the button's hint then names them (config missing or
 * invalid: error).
 *
 * Desktop shows the compact "Demo N" button (description and problems in its tooltip). In the mobile header menu the
 * item also shows the demo's description and a status line (loading / error / missing images); the menu closes once
 * the demo has loaded cleanly and stays open when there is something to read.
 */
export function DemoButton({ index }: DemoButtonProps) {
  const { t, i18n } = useTranslation();
  const menu = useHeaderMenu();
  const id = useId();
  const [state, setState] = useState<DemoState>({ status: 'idle' });

  const load = async () => {
    setState({ status: 'busy' });
    try {
      const { missing } = await loadDemoConfiguration(index);
      setState(missing.length === 0 ? { status: 'idle' } : { status: 'partial', missing });
      if (missing.length === 0) menu.close();
    } catch {
      setState({ status: 'error' });
    }
  };

  const folder = `public/${demoFolder(index)}`;
  const hintKey = `app.demoHints.${index}`;
  const description = i18n.exists(hintKey) ? t(hintKey) : t('app.demoHintGeneric', { folder });
  const problem =
    state.status === 'partial' && state.missing?.length
      ? t('app.demoMissing', { files: state.missing.join(', ') })
      : state.status === 'error'
        ? t('app.demoError', { folder })
        : null;
  const title = problem ?? (i18n.exists(hintKey) ? t('app.demoTooltip', { index, folder, description }) : description);

  return (
    <>
      <button
        type="button"
        className={problem ? 'demo-button has-problem' : 'demo-button'}
        onClick={() => void load()}
        disabled={state.status === 'busy'}
        aria-busy={state.status === 'busy'}
        aria-describedby={`${id}-description ${id}-status`}
        title={title}
      >
        <span className="demo-button__label">{state.status === 'busy' ? t('app.demoBusy') : t('app.demoNumbered', { index })}</span>
        {/* Read as the button's description (not its name); shown only in the mobile menu (index.css). */}
        <span id={`${id}-description`} className="demo-button__description" aria-hidden="true">
          {description}
        </span>
        <span id={`${id}-status`} className="demo-button__status" aria-hidden="true">
          {problem ?? ''}
        </span>
      </button>
      {/* Announces a problem when it appears (the description above is only read on focus). */}
      <span role="status" className="visually-hidden">
        {problem ?? ''}
      </span>
    </>
  );
}
