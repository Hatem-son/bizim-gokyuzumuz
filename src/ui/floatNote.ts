export function showFloatNote(
  anchor: { x: number; y: number; height?: number },
  html: string
): void {
  document.querySelectorAll('.float-note').forEach((n) => n.remove());

  const note = document.createElement('div');
  const below = anchor.y < 160;
  note.className = `float-note${below ? ' below' : ''}`;
  note.innerHTML = html;

  const clampedX = Math.min(window.innerWidth - 135, Math.max(135, anchor.x));
  const topY = below ? anchor.y + (anchor.height ?? 32) / 2 + 12 : anchor.y - (anchor.height ?? 32) / 2 - 10;

  note.style.left = `${clampedX}px`;
  note.style.top = `${topY}px`;
  note.addEventListener('animationend', () => note.remove());
  document.body.appendChild(note);
}

