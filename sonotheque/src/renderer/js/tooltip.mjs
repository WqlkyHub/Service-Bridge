// Info-bulle riche qui suit la ligne survolée (affichée après un court délai).

import { h, clear } from './dom.mjs';

const DELAY = 380;
let el;
let timer = null;
let current = null;

function host() {
  el ??= document.body.appendChild(h('div', { class: 'tooltip', role: 'tooltip' }));
  return el;
}

/**
 * Attache une info-bulle à `target`. `build()` renvoie le contenu (appelé à l'affichage).
 * `key` identifie la ligne : si elle est redessinée pendant le délai, on retrouve la nouvelle.
 */
export function attachTooltip(target, build, key = null) {
  if (key) target.dataset.tipKey = key;
  target.addEventListener('mouseenter', (e) => {
    clearTimeout(timer);
    const { clientX, clientY } = e;
    timer = setTimeout(() => show(target, build(), clientX, clientY), DELAY);
  });
  target.addEventListener('mousemove', (e) => {
    if (current === target) position(e.clientX, e.clientY);
  });
  target.addEventListener('mouseleave', hideTooltip);
  target.addEventListener('mousedown', hideTooltip);
}

function show(target, content, x, y) {
  if (!target.isConnected) {
    const key = target.dataset.tipKey;
    const replacement = key ? document.querySelector(`[data-tip-key="${CSS.escape(key)}"]`) : null;
    if (!replacement?.matches(':hover')) return;
    target = replacement;
  }
  const t = host();
  clear(t).append(content);
  t.classList.add('visible');
  current = target;
  position(x, y);
}

function position(x, y) {
  const t = host();
  const pad = 16;
  const { width, height } = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + width > window.innerWidth - 8) left = Math.max(8, x - width - pad);
  if (top + height > window.innerHeight - 8) top = Math.max(8, y - height - pad);
  t.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTooltip() {
  clearTimeout(timer);
  current = null;
  el?.classList.remove('visible');
}
