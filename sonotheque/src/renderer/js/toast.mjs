import { h } from './dom.mjs';

let host;

/** Petit message temporaire en bas à droite. type : 'info' | 'ok' | 'error' */
export function toast(message, type = 'info', ms = 3800) {
  host ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: ['toast', `toast-${type}`] }, message);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
