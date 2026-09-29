import { useEffect, useRef, useState, type ReactNode } from 'react';

type InfoTipProps = {
  /** Id of the tooltip element — reference it from the related input's `aria-describedby`. */
  id: string;
  /** Accessible name of the (i) button, e.g. "More info: Width". */
  label: string;
  children: ReactNode;
};

/**
 * Small (i) button with a tooltip. Opens on hover, on keyboard focus and on tap/click (click pins it open);
 * Escape, blur or a tap outside closes it. The tooltip stays in the DOM while closed so `aria-describedby`
 * references to it keep working.
 */
export function InfoTip({ id, label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  const close = () => {
    setOpen(false);
    setPinned(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="infotip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        className="infotip__button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          if (pinned) {
            close();
          } else {
            setPinned(true);
            setOpen(true);
          }
        }}
      >
        i
      </button>
      <span id={id} role="tooltip" className={open ? 'infotip__bubble is-open' : 'infotip__bubble'}>
        {children}
      </span>
    </span>
  );
}
