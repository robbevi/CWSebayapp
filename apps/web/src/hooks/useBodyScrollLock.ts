import { useLayoutEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

// Freezes the page behind an open modal. `overflow: hidden` on <body> alone is not enough
// on iOS Safari — it keeps scrolling the page behind the overlay — so the body is also
// pinned with `position: fixed` at its current offset and restored on release.
//
// Ref-counted because modals stack (Part Detail can sit under a confirm, the Filters
// drawer under a dropdown): the page must only unlock once the last one closes.
function lock(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

function unlock(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  window.scrollTo(0, savedScrollY);
}

export function useBodyScrollLock(active = true): void {
  useLayoutEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
