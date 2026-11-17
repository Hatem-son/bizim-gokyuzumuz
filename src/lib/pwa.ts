export function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function updateAppBadge(unreadCount: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(unreadCount).catch(() => undefined);
    } else if (unreadCount <= 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => undefined);
    }
  } catch {
    // Ignore unsupported badge API errors
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const tryReloadForUpdate = () => {
    if (reloading) return;
    // Kullanıcı yazı/çizim/şifre ekranındayken yarıda kesme; kart kapanınca yenile
    const busyOverlay = document.querySelector('.compose-sheet, .board, .watch, .auth, .star-sheet');
    if (busyOverlay) {
      window.setTimeout(tryReloadForUpdate, 1500);
      return;
    }
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      tryReloadForUpdate();
    }
  });

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
