import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { demoFolder, loadDemoConfiguration } from '../demo/demoConfiguration';

type DemoButtonProps = {
  /** Demo number: loads `public/demo<index>/config.json` and its images (client, 30.09.2026). */
  index: number;
};

/**
 * Loads one demo folder. Missing demo images are skipped; the button's hint then names them (config missing or
 * invalid: error).
 */
export function DemoButton({ index }: DemoButtonProps) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'error' | 'partial'; missing?: string[] }>({
    status: 'idle',
  });

  const load = async () => {
    setState({ status: 'busy' });
    try {
      const { missing } = await loadDemoConfiguration(index);
      setState(missing.length === 0 ? { status: 'idle' } : { status: 'partial', missing });
    } catch {
      setState({ status: 'error' });
    }
  };

  const hintKey = `app.demoHints.${index}`;
  const title =
    state.status === 'partial' && state.missing?.length
      ? t('app.demoMissing', { files: state.missing.join(', ') })
      : state.status === 'error'
        ? t('app.demoError', { folder: `public/${demoFolder(index)}` })
        : i18n.exists(hintKey)
          ? t(hintKey)
          : t('app.demoHintGeneric', { folder: `public/${demoFolder(index)}` });

  return (
    <button type="button" className="demo-button" onClick={load} disabled={state.status === 'busy'} title={title}>
      {state.status === 'busy' ? t('app.demoBusy') : t('app.demoNumbered', { index })}
    </button>
  );
}
