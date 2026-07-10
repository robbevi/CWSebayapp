import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

// Popovers used to be `position: absolute; left: 0` relative to their trigger. That's
// fine when triggers are a fixed, generous width, but once a trigger shrinks (e.g. the
// mobile filter row, where each control is a narrow flex-1 box), an anchored popover
// wider than its trigger overflows past the right edge of the viewport — which forces
// the whole page wider and shifts everything else. It also broke vertically inside the
// Filters drawer: a popover opened from a filter low in the drawer ran off the bottom.
//
// This computes a viewport-clamped `position: fixed` style: horizontally clamped so it
// never spills past either edge, and vertically flipped to open *above* the trigger when
// there isn't enough room below. Measured synchronously in useLayoutEffect (before paint,
// with the trigger ref guaranteed attached) and re-measured on scroll/resize while open.
export function useDropdownPosition(open: boolean, triggerRef: RefObject<HTMLElement | null>, width: number) {
  const [style, setStyle] = useState<CSSProperties>({});

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;
    const gap = 4;

    const clampedWidth = Math.min(width, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + clampedWidth > viewportWidth - margin) left = viewportWidth - margin - clampedWidth;
    if (left < margin) left = margin;

    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const preferredMaxHeight = 320;

    let top: number;
    let maxHeight: number;
    if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
      top = rect.bottom + gap;
      maxHeight = Math.max(120, Math.min(preferredMaxHeight, spaceBelow));
    } else {
      maxHeight = Math.max(120, Math.min(preferredMaxHeight, spaceAbove));
      top = rect.top - gap - maxHeight;
    }

    setStyle({ position: 'fixed', top, left, width: clampedWidth, maxHeight });
  }, [triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return style;
}
