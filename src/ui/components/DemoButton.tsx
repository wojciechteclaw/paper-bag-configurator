import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadDemoConfiguration } from '../demo/demoConfiguration';

/** Loads the demo configuration (250 × 200 × 400 mm, white 100 g/m², wave artwork on all walls, extended to the bottom). */
export function DemoButton() {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  const load = async () => {
    setState('busy');
    try {
      await loadDemoConfiguration();
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <button
      type="button"
      className="demo-button"
      onClick={load}
      disabled={state === 'busy'}
      title={state === 'error' ? t('app.demoError') : t('app.demoHint')}
    >
      {state === 'busy' ? t('app.demoBusy') : t('app.demo')}
    </button>
  );
}
