import { useCallback, useSyncExternalStore } from 'react';

/**
 * Where the preview can be collapsed: the stacked layout (≤ 900 px) in portrait — not phones in landscape (preview
 * beside the configuration) and not desktop. Keep in sync with the `.preview-collapse` rules in index.css.
 */
export const COLLAPSIBLE_PREVIEW_QUERY = '(max-width: 900px) and (orientation: portrait), (max-width: 900px) and (min-height: 561px)';

/** Whether a CSS media query currently matches (false where `matchMedia` is unavailable, e.g. tests). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const snapshot = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
