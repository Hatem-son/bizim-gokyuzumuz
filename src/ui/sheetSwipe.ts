export interface SheetSwipeOptions {
  onClose: () => void;
  /** Özel kaydırılabilir alanlarda (örn. uzun textarea veya chip listesi) çakışmayı önlemek için kontrol */
  canStart?: (target: EventTarget | null) => boolean;
}

/** Alt sayfalara iOS stili aşağı sürükleyerek kapatma ve yaylı bırakma davranışı ekler. */
export function attachSheetSwipe(
  sheetEl: HTMLElement,
  cardEl: HTMLElement,
  opts: SheetSwipeOptions
): () => void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocityY = 0;
  let dragging = false;
  let cancelled = false;
  let suppressNextClick = false;

  const isInScrollableChild = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('input, select, option')) return true;
    const ta = el.closest('textarea');
    if (ta && ta.scrollHeight > ta.clientHeight + 2 && ta.scrollTop > 0) return true;
    if (ta && ta.scrollHeight > ta.clientHeight + 2) return true;
    const chips = el.closest('#chips');
    if (chips && chips.scrollWidth > chips.clientWidth + 2) return true;
    return false;
  };

  const resetInline = () => {
    cardEl.classList.remove('swiping');
    cardEl.style.transition = '';
    cardEl.style.transform = '';
    sheetEl.style.transition = '';
    sheetEl.style.backgroundColor = '';
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!sheetEl.classList.contains('open')) return;
    if (e.button > 0 || activePointerId !== null) return;
    if (opts.canStart && !opts.canStart(e.target)) return;
    const onHandleOrHeader = Boolean((e.target as HTMLElement | null)?.closest('.handle, .sheet-head'));
    if (!onHandleOrHeader && (cardEl.scrollTop > 1 || isInScrollableChild(e.target))) return;

    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastY = e.clientY;
    lastT = performance.now();
    velocityY = 0;
    dragging = false;
    cancelled = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId || cancelled) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        cancelled = true;
        activePointerId = null;
        return;
      }
      if (dy < -8 && cardEl.scrollHeight > cardEl.clientHeight + 2) {
        cancelled = true;
        activePointerId = null;
        return;
      }
      if (dy <= 8) return;
      if (Math.abs(dy) < Math.abs(dx) * 1.15) return;

      dragging = true;
      suppressNextClick = true;
      cardEl.classList.add('swiping');
      try {
        cardEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture isn't supported
      }
      if (document.activeElement instanceof HTMLElement && cardEl.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      cardEl.style.transition = 'none';
      sheetEl.style.transition = 'none';
    }

    const offset = Math.max(0, dy);
    const now = performance.now();
    const dt = Math.max(4, now - lastT);
    const instV = (e.clientY - lastY) / dt;
    velocityY = velocityY * 0.55 + instV * 0.45;
    lastY = e.clientY;
    lastT = now;

    if (!reducedMotion) {
      cardEl.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }
    const maxDist = Math.max(240, cardEl.offsetHeight * 0.85);
    const fade = Math.max(0, Math.min(1, 1 - offset / maxDist));
    sheetEl.style.backgroundColor = `rgba(4, 2, 14, ${(0.56 * fade).toFixed(3)})`;
  };

  const finishDrag = (e: PointerEvent, forceReset: boolean) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    try {
      if (cardEl.hasPointerCapture(e.pointerId)) {
        cardEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (!dragging) return;
    dragging = false;
    const totalDy = Math.max(0, e.clientY - startY);
    const threshold = Math.min(135, Math.max(85, cardEl.offsetHeight * 0.32));
    const shouldClose = !forceReset && (totalDy >= threshold || (totalDy >= 56 && velocityY >= 0.45));

    resetInline();
    if (shouldClose) {
      opts.onClose();
    }
  };

  const onPointerUp = (e: PointerEvent) => finishDrag(e, false);
  const onPointerCancel = (e: PointerEvent) => finishDrag(e, true);
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.stopPropagation();
    e.preventDefault();
  };

  cardEl.addEventListener('pointerdown', onPointerDown, { passive: true });
  cardEl.addEventListener('pointermove', onPointerMove, { passive: true });
  cardEl.addEventListener('pointerup', onPointerUp);
  cardEl.addEventListener('pointercancel', onPointerCancel);
  cardEl.addEventListener('click', onClickCapture, { capture: true });

  return () => {
    resetInline();
    cardEl.removeEventListener('pointerdown', onPointerDown);
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', onPointerUp);
    cardEl.removeEventListener('pointercancel', onPointerCancel);
    cardEl.removeEventListener('click', onClickCapture, { capture: true });
  };
}
