import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderMenu } from '../../../src/ui/components/HeaderMenu';
import { useHeaderMenu } from '../../../src/ui/components/headerMenuContext';

function CloseButton() {
  const menu = useHeaderMenu();
  return (
    <button type="button" onClick={() => menu.close()}>
      Zamknij po akcji
    </button>
  );
}

function renderMenu() {
  render(
    <>
      <HeaderMenu label="Menu">
        <button type="button">Pierwsza</button>
        <CloseButton />
      </HeaderMenu>
      <button type="button">Poza menu</button>
    </>,
  );
  const toggle = screen.getByRole('button', { name: 'Menu' });
  const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  return { toggle, panel };
}

describe('HeaderMenu', () => {
  it('is a disclosure: the toggle controls the panel and reports its state', () => {
    const { toggle, panel } = renderMenu();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toHaveClass('is-open');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveClass('is-open');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves focus into the panel when opened and back to the toggle on Escape', () => {
    const { toggle, panel } = renderMenu();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Pierwsza' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel).not.toHaveClass('is-open');
    expect(toggle).toHaveFocus();
  });

  it('closes on a pointer press outside and when focus leaves it, not on presses inside', () => {
    const { toggle, panel } = renderMenu();
    fireEvent.click(toggle);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pierwsza' }));
    expect(panel).toHaveClass('is-open');
    fireEvent.pointerDown(document.body);
    expect(panel).not.toHaveClass('is-open');

    fireEvent.click(toggle);
    const outside = screen.getByRole('button', { name: 'Poza menu' });
    fireEvent.blur(screen.getByRole('button', { name: 'Pierwsza' }), { relatedTarget: outside });
    expect(panel).not.toHaveClass('is-open');
  });

  it('lets items close it (useHeaderMenu) and keeps them mounted while closed', () => {
    const { toggle, panel } = renderMenu();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij po akcji' }));
    expect(panel).not.toHaveClass('is-open');
    expect(panel).toContainElement(screen.getByRole('button', { name: 'Zamknij po akcji', hidden: true }));
  });
});
