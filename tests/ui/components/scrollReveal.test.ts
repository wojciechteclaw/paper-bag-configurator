import { describe, expect, it } from 'vitest';
import { revealHorizontally, scrollOffsetToReveal } from '../../../src/ui/components/scrollReveal';

describe('scrollOffsetToReveal', () => {
  it('keeps the offset when the item is already visible', () => {
    expect(scrollOffsetToReveal(50, 100, 0, 300)).toBe(0);
    expect(scrollOffsetToReveal(150, 200, 100, 300)).toBe(100);
  });

  it('scrolls right just enough to show an item past the right edge (with the margin)', () => {
    expect(scrollOffsetToReveal(320, 400, 0, 300)).toBe(108);
  });

  it('scrolls left to an item before the left edge, never below 0', () => {
    expect(scrollOffsetToReveal(40, 90, 100, 300)).toBe(32);
    expect(scrollOffsetToReveal(4, 50, 100, 300)).toBe(0);
  });

  it('aligns an item wider than the scroller to its start', () => {
    expect(scrollOffsetToReveal(200, 600, 0, 300)).toBe(192);
  });
});

describe('revealHorizontally', () => {
  const box = (left: number, width: number) => ({ left, right: left + width, width }) as DOMRect;

  it('scrolls only the scroller, and only when its content overflows', () => {
    const scroller = document.createElement('div');
    const item = document.createElement('button');
    scroller.append(item);
    Object.defineProperties(scroller, {
      scrollWidth: { value: 500, configurable: true },
      clientWidth: { value: 300, configurable: true },
    });
    Object.defineProperty(item, 'offsetWidth', { value: 80 });
    scroller.getBoundingClientRect = () => box(10, 300);
    item.getBoundingClientRect = () => box(350, 80); // 340 px into the content, past the right edge
    revealHorizontally(scroller, item);
    expect(scroller.scrollLeft).toBe(128);

    Object.defineProperty(scroller, 'scrollWidth', { value: 300 });
    scroller.scrollLeft = 0;
    revealHorizontally(scroller, item);
    expect(scroller.scrollLeft).toBe(0);
  });
});
