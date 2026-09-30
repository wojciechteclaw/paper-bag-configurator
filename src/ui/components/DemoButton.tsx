import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keyForType } from '../../i18n/keyForType';
import type { BagType } from '../../domain/types';
import { loadDemoConfiguration } from '../demo/demoConfiguration';

type DemoButtonProps = {
  /** Bag type whose demo (`DEMO_CONFIGURATIONS`) the button loads — whatever type is currently selected. */
  productType: BagType;
  /** Number shown on the button: "Demo 1", "Demo 2" (client, 30.09.2026). */
  index: number;
};

/**
 * Loads the demo configuration of one bag type. Missing demo images are skipped; the button's hint then names them
 * (all missing: error).
 */
export function DemoButton({ productType, index }: DemoButtonProps) {
  const { t } = useTranslation();
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
      {state.status === 'busy' ? t('app.demoBusy') : t('app.demoNumbered', { index })}
    </button>
  );
}
