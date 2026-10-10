// Fiche d'informations attachée à un bouton « infos » : elle s'affiche quand on s'arrête dessus,
// tout de suite au clic ou au clavier, et suit la souris.

import { h, clear } from './dom.mjs';

const DELAY = 150;
let el;
let timer = null;
let current = null;

function host() {
  if (!el) {
    el = document.body.appendChild(h('div', { class: 'tooltip', role: 'tooltip' }));
    // Une ligne redessinée pendant que sa fiche est ouverte emporte son bouton : sans ceci,
    // la fiche resterait affichée. (On ne touche pas au délai en cours : le nouveau bouton,
    // sous la souris, vient peut-être de programmer son affichage.)
    document.addEventListener('mousemove', () => {
      if (current && !current.isConnected) {
        current = null;
        el.classList.remove('visible');
      }
    });
  }
  return el;
}

/**
 * Attache une fiche à `target`. `build()` renvoie le contenu (appelé à l'affichage).
 * `key` identifie la ligne : si elle est redessinée pendant le délai, on retrouve le nouveau bouton.
 */
export function attachTooltip(target, build, key = null) {
  if (key) target.dataset.tipKey = key;
  const below = () => {
    const r = target.getBoundingClientRect();
    return [r.left, r.bottom - 8];
  };
  target.addEventListener('mouseenter', (e) => {
    clearTimeout(timer);
    const { clientX, clientY } = e;
    timer = setTimeout(() => show(target, build(), clientX, clientY), DELAY);
  });
  target.addEventListener('mousemove', (e) => {
    if (current === target) position(e.clientX, e.clientY);
  });
  target.addEventListener('mouseleave', hideTooltip);
  target.addEventListener('click', () => {
    clearTimeout(timer);
    show(target, build(), ...below());
  });
  target.addEventListener('focus', () => {
    if (target.matches(':focus-visible')) show(target, build(), ...below());
  });
  target.addEventListener('blur', hideTooltip);
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
