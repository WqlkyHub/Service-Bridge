// Fenêtre modale générique (Échap pour fermer, Entrée pour valider).

import { h } from './dom.mjs';
import { hideTooltip } from './tooltip.mjs';
import { icon } from './icons.mjs';

let openCount = 0;

export function isModalOpen() {
  return openCount > 0;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {Node|Node[]} o.body
 * @param {Array<{label, primary?, danger?, onClick?: () => (boolean|void|Promise)}>} o.actions
 *        onClick qui renvoie false garde la fenêtre ouverte.
 * @param {string} [o.size]  'small' | 'wide'
 */
export function openModal({ title, body, actions = [], size = '', onClose } = {}) {
  hideTooltip();
  openCount++;
  const previousFocus = document.activeElement;
  let closed = false;

  const buttons = actions.map((a) => {
    const b = h('button', {
      class: ['btn', a.primary && 'btn-primary', a.danger && 'btn-danger'],
      type: 'button',
      onclick: async () => {
        if (b.disabled) return;
        // Bouton bloqué pendant l'action : un double clic ne lance pas deux imports.
        b.disabled = true;
        try {
          const res = await a.onClick?.();
          if (res !== false) close();
        } finally {
          b.disabled = false;
        }
      },
    }, a.label);
    if (a.primary) b.dataset.primary = '1';
    return b;
  });

  const dialog = h('div', { class: ['modal', size && `modal-${size}`], role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' },
      h('h2', {}, title),
      h('button', { class: 'modal-close icon-btn', type: 'button', 'aria-label': 'Fermer', onclick: () => close() }, icon('close', { size: 18 }))),
    h('div', { class: 'modal-body' }, body),
    buttons.length ? h('div', { class: 'modal-foot' }, buttons) : null,
  );
  const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, dialog);

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      const t = e.target;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT') return;
      const primary = buttons.find((b) => b.dataset.primary);
      if (primary) {
        e.preventDefault();
        primary.click();
      }
    }
    e.stopPropagation(); // les raccourcis de l'appli ne s'appliquent pas sous la fenêtre
  }

  function close() {
    if (closed) return;
    closed = true;
    openCount--;
    overlay.removeEventListener('keydown', onKey);
    overlay.remove();
    onClose?.();
    previousFocus?.focus?.();
  }

  overlay.addEventListener('keydown', onKey);
  document.body.append(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    const first = dialog.querySelector('[autofocus], input:not([disabled]), select, textarea') ?? buttons.find((b) => b.dataset.primary);
    first?.focus();
  });

  return { close, dialog, buttons, submit: () => buttons.find((b) => b.dataset.primary)?.click() };
}

/** Confirmation simple ; renvoie une promesse booléenne. */
export function confirmDialog(title, message, { confirmLabel = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      size: 'small',
      body: h('p', { class: 'modal-text' }, message),
      actions: [
        { label: 'Annuler', onClick: () => { answered = true; resolve(false); } },
        { label: confirmLabel, primary: true, danger, onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}
