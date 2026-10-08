// Petits outils d'interface. Tout le texte passe par des nœuds texte (jamais innerHTML) :
// les titres et descriptions venant d'internet ne peuvent donc pas injecter de code.

/**
 * Crée un élément : h('button', { class: 'btn', onclick: fn, title: '…' }, 'Texte', autreElement)
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

/** Durée lisible : 0:07, 1:32, 1:02:05 */
export function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Durée précise pour les sons courts : 0,8 s */
export function formatDurationShort(sec) {
  if (sec == null || !Number.isFinite(sec)) return '–';
  if (sec < 10) return `${sec.toFixed(1).replace('.', ',')} s`;
  return formatDuration(sec);
}

export function formatSize(bytes) {
  if (!bytes) return '–';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

export function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Petit émetteur d'événements. */
export class Emitter {
  #handlers = new Map();
  on(evt, fn) {
    if (!this.#handlers.has(evt)) this.#handlers.set(evt, new Set());
    this.#handlers.get(evt).add(fn);
    return () => this.#handlers.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    for (const fn of this.#handlers.get(evt) ?? []) fn(payload);
  }
}

/** Nom de domaine lisible d'une URL. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
