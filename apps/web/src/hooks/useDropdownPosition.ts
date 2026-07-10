import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

// Popovers used to be `position: absolute; left: 0` relative to their trigger. That's
// fine when triggers are a fixed, generous width, but once a trigger shrinks (e.g. the
// mobile filter row, where each control is a narrow flex-1 box), an anchored popover
// wider than its trigger overflows past the right edge of the viewport — which forces
// the whole page wider and shifts everything else. Computing a `position: fixed` style
// ourselves, clamped to the viewport, avoids that regardless of how narrow the trigger is.
export function useDropdownPosition(open: boolean, triggerRef: RefObject<HTMLElement | null>, width: number) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const reposition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const margin = 8;
      const clampedWidth = Math.min(width, window.innerWidth - margin * 2);
      let left = rect.left;
      if (left + clampedWidth > window.innerWidth - margin) {
        left = window.innerWidth - margin - clampedWidth;
      }
      if (left < margin) left = margin;
      setStyle({ position: 'fixed', top: rect.bottom + 4, left, width: clampedWidth });
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, triggerRef, width]);

  return style;
}
