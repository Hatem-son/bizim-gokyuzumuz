import { $ } from './dom';

let toastTimer: number | undefined;

export function showToast(
  title: string,
  sub: string,
  color: 'blue' | 'pink' | 'gold',
  sign: string
): void {
  $('#toast-title').textContent = title;
  $('#toast-sub').textContent = sub;

  const medal = $('#toast-medal');
  medal.className = `medal sm ${color}`;
  medal.textContent = sign;

  const toast = $('#toast');
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

