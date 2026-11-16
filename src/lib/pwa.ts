export function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    void reg.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        void reg.update().catch(() => undefined);
      }
    });
    return reg;
  } catch {
    return null;
  }
}

