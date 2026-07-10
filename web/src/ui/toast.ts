// Lightweight toast notifications rendered into #toast-root.

const root = () => document.getElementById('toast-root') as HTMLElement;

export function showToast(
  message: string,
  kind: 'info' | 'success' | 'error' = 'info',
  ttl = 3200,
): void {
  const host = root();
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  host.appendChild(el);
  const remove = () => {
    el.style.transition = 'opacity .25s ease, transform .25s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  };
  const t = setTimeout(remove, ttl);
  el.addEventListener('click', () => {
    clearTimeout(t);
    remove();
  });
}
