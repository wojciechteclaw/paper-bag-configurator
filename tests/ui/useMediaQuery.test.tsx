import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from '../../src/ui/useMediaQuery';

function Probe({ query }: { query: string }) {
  return <span data-testid="match">{String(useMediaQuery(query))}</span>;
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('is false where matchMedia is unavailable (tests, SSR)', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Probe query="(max-width: 900px)" />);
    expect(screen.getByTestId('match')).toHaveTextContent('false');
  });

  it('follows the media query and its changes', () => {
    let matches = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (media: string) => ({
      get matches() {
        return matches;
      },
      media,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    render(<Probe query="(max-width: 900px)" />);
    expect(screen.getByTestId('match')).toHaveTextContent('true');
    matches = false;
    act(() => listeners.forEach((listener) => listener()));
    expect(screen.getByTestId('match')).toHaveTextContent('false');
  });
});
