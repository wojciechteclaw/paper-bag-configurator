/**
 * Horizontal scroll offset that brings `[start, end)` (px along the scroller's content) into a scroller of `width`
 * currently at `scrollLeft`, moving it as little as possible (with `margin` px of room on the revealed side).
 */
export function scrollOffsetToReveal(start: number, end: number, scrollLeft: number, width: number, margin = 8): number {
  if (end - start + 2 * margin >= width || start - margin < scrollLeft) return Math.max(0, start - margin);
  if (end + margin > scrollLeft + width) return end + margin - width;
  return scrollLeft;
}

/** Scrolls `scroller` horizontally (only it, never the page) so that `item` is visible. */
export function revealHorizontally(scroller: HTMLElement, item: HTMLElement): void {
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  const offset = item.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
  scroller.scrollLeft = scrollOffsetToReveal(offset, offset + item.offsetWidth, scroller.scrollLeft, scroller.clientWidth);
}
