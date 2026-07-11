import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

// Popovers used to be `position: absolute; left: 0` relative to their trigger. That's
// fine when triggers are a fixed, generous width, but once a trigger shrinks (e.g. the
// mobile filter row, where each control is a narrow flex-1 box), an anchored popover
// wider than its trigger overflows past the right edge of the viewport — which forces
// the whole page wider and shifts everything else. It also broke vertically inside the
// Filters drawer: a popover opened from a filter low in the drawer ran off the bottom.
//
// This computes a viewport-clamped `position: fixed` style: horizontally clamped so it
// never spills past either edge, and vertically flipped to open *above* the trigger when
// there isn't enough room below.
//
// Start out-of-flow and invisible: the popover must NEVER render `position: static` (its
// default) even for a single frame, or its full-height option list flows into the layout,
// shoves the trigger, and the very first measurement reads a wrong trigger position.
const HIDDEN_STYLE: CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

export function useDropdownPosition(open: boolean, triggerRef: RefObject<HTMLElement | null>, width: number) {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE);
  const popoverRef = useRef<HTMLElement | null>(null);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;
    const gap = 4;
    const preferredMaxHeight = 320;

    const clampedWidth = Math.min(width, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + clampedWidth > viewportWidth - margin) left = viewportWidth - margin - clampedWidth;
    if (left < margin) left = margin;

    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;

    if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
      // Opening below anchors exactly regardless of the popover's real content height
      // (its top just sits at the trigger's bottom edge), so no measurement is needed.
      const maxHeight = Math.max(120, Math.min(preferredMaxHeight, spaceBelow));
      setStyle({ position: 'fixed', top: rect.bottom + gap, left, width: clampedWidth, maxHeight });
      return;
    }

    // Opening above only anchors correctly if we know the popover's real rendered
    // height — a short 2-option Yes/No list is nowhere near 320px tall, so reserving
    // a fixed 320px and positioning from that assumption leaves a big empty gap
    // between the (much shorter) real popover and the trigger it's supposed to sit
    // against. The hidden popover is already mounted (visibility:hidden, unclamped)
    // by this point, so its natural height can just be measured directly.
    const naturalHeight = popoverRef.current?.scrollHeight ?? preferredMaxHeight;
    const maxHeight = Math.max(80, Math.min(preferredMaxHeight, spaceAbove));
    const height = Math.min(naturalHeight, maxHeight);
    const top = rect.top - gap - height;
    setStyle({ position: 'fixed', top, left, width: clampedWidth, maxHeight });
  }, [triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);

    // Belt-and-suspenders: re-measure every frame while open so any later layout shift
    // (from content loading in above it, etc.) is corrected within one frame regardless
    // of whether it happens to fire a 'resize'/'scroll' event.
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

  return { style, popoverRef };
}
