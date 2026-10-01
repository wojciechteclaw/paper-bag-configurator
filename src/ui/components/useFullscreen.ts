import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Full-screen state of one element (client, 01.10.2026: "tryb pełnoekranowy samej torby"). Uses the Fullscreen API
 * where the browser allows it on an element; elsewhere (e.g. iPhone Safari) falls back to a CSS overlay — the caller
 * renders `active` as a fixed, full-viewport class. Escape leaves either mode.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const sync = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [target]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  const enter = useCallback(async () => {
    const element = target.current;
    if (element && document.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
      try {
        await element.requestFullscreen();
        return;
      } catch {
        // Not allowed here: fall back to the overlay.
      }
    }
    setOverlay(true);
  }, [target]);

  const exit = useCallback(async () => {
    setOverlay(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Already left.
      }
    }
  }, []);

  const active = native || overlay;
  return { active, overlay, toggle: () => (active ? exit() : enter()) };
}
