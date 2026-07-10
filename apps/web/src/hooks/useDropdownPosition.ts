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
// Start out-of-flow and invisible: the popover must NEVER render `position: static` (its
// default) even for a single frame, or its full-height option list flows into the layout,
// shoves the trigger, and the very first measurement reads a wrong trigger position (the
// "first open lands in the wrong place, reopen is fine" bug). useLayoutEffect fills in the
// real coordinates + visibility before paint, so the hidden state is never actually seen.
const HIDDEN_STYLE: CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

export function useDropdownPosition(open: boolean, triggerRef: RefObject<HTMLElement | null>, width: number) {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE);

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

    // Belt-and-suspenders: on a real device we saw this drift out of sync with the
    // trigger's actual position on some opens even after the above listeners were added
    // (couldn't pin down the exact trigger — likely a mobile keyboard/toolbar resize that
    // doesn't fire a plain 'resize' event, or fires it before the visual viewport has
    // settled). Re-measuring every frame while open is cheap for a short-lived popover and
    // guarantees it tracks the trigger regardless of what caused the shift.
    let rafId = requestAnimationFrame(function loop() {
      reposition();
      rafId = requestAnimationFrame(loop);
    });

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      cancelAnimationFrame(rafId);
    };
  }, [open, reposition]);

  return style;
}
