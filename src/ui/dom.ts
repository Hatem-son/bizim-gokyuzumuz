export function $<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element bulunamadı: ${selector}`);
  return el;
}

export function $$<T extends Element = HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function setInert(el: Element, inert: boolean): void {
  el.setAttribute('aria-hidden', inert ? 'true' : 'false');
  (el as HTMLElement & { inert: boolean }).inert = inert;
}

