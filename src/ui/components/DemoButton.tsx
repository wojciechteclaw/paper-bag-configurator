import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keyForType } from '../../i18n/keyForType';
import { useConfigurationStore } from '../../state/configurationStore';
import { loadDemoConfiguration } from '../demo/demoConfiguration';

/**
 * Loads the demo configuration of the currently selected bag type (`DEMO_CONFIGURATIONS`). Missing demo images are
 * skipped; the button's hint then names them (all missing: error).
 */
export function DemoButton() {
  const { t } = useTranslation();
  const productType = useConfigurationStore((s) => s.configuration.productType);
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'error' | 'partial'; missing?: string[] }>({
    status: 'idle',
  });

  const load = async () => {
    setState({ status: 'busy' });
    try {
      const { missing, total } = await loadDemoConfiguration(undefined, productType);
      if (missing.length === 0) setState({ status: 'idle' });
      else setState({ status: missing.length === total ? 'error' : 'partial', missing });
    } catch {
      setState({ status: 'error' });
    }
  };

  const title =
    state.status === 'error' || state.status === 'partial'
      ? state.missing?.length
        ? t('app.demoMissing', { files: state.missing.join(', ') })
        : t('app.demoError')
      : t(keyForType('app.demoHint', productType));

  return (
    <button type="button" className="demo-button" onClick={load} disabled={state.status === 'busy'} title={title}>
      {state.status === 'busy' ? t('app.demoBusy') : t('app.demo')}
    </button>
  );
}
