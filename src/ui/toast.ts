import { HEART_PATH } from '../lib/illustrations';
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
  if (sign === '♡' || sign === '♥') {
    medal.innerHTML = `<svg class="medal-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`;
  } else {
    medal.textContent = sign;
  }

  const toast = $('#toast');
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

