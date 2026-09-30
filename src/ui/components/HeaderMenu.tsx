import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { HeaderMenuContext } from './headerMenuContext';

type HeaderMenuProps = {
  /** Accessible name (and, from 421 px, the visible text) of the ☰ toggle, e.g. "Menu". */
  label: string;
  children: ReactNode;
};

const FOCUSABLE = 'button:not(:disabled), [href], input:not([type="hidden"]):not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Header navigation menu (client [K] 30.09.2026). On narrow screens (≤ 900 px, index.css) a ☰ disclosure button opens
 * a panel below the header; on desktop the toggle is hidden and the panel is the ordinary row of header buttons.
 *
 * - The panel stays mounted while closed (hidden with `visibility`), so its buttons keep their state — a running
 *   save / load, a demo that is loading — and the save / load message and confirmation dialog inside it can still show.
 * - Opening moves focus to the first item; Escape closes and returns focus to the toggle; a pointer press or focus
 *   outside the menu closes it. Items close it through `useHeaderMenu().close()`.
 */
export function HeaderMenu({ label, children }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const api = useMemo(() => ({ close: () => setOpen(false) }), []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  // Tabbing out of the menu closes it (focus moving to nowhere — a click on the page — is handled by pointerdown).
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <div ref={rootRef} className="header-menu" onBlur={onBlur}>
      <button
        ref={toggleRef}
        type="button"
        className="header-menu__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="header-menu__icon" aria-hidden="true" />
        <span className="header-menu__label" aria-hidden="true">
          {label}
        </span>
      </button>
      {/* Not `role="menu"`: ordinary buttons in sections, reached with Tab (disclosure navigation pattern). */}
      <div ref={panelRef} id={panelId} className={open ? 'header-menu__panel is-open' : 'header-menu__panel'}>
        <HeaderMenuContext.Provider value={api}>{children}</HeaderMenuContext.Provider>
      </div>
    </div>
  );
}
