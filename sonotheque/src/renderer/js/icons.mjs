// Icônes SVG (trait 1,8 px, 24×24) : rendu net et identique sur tous les PC, contrairement aux emojis.

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  play: ['M8 5.5v13l11-6.5z'],
  pause: ['M7 5h3.5v14H7z', 'M13.5 5H17v14h-3.5z'],
  search: ['M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'M15.5 15.5 20 20'],
  globe: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M3 12h18', 'M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z'],
  library: ['M4 19V5', 'M8 19V5', 'M12 19V7', 'M15.5 6.5l3.8 12'],
  sparkles: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  folder: ['M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v9.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z'],
  settings: ['M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7'],
  keyboard: ['M3 7h18v10H3z', 'M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8'],
  loop: ['M17 2.5l3 3-3 3', 'M4 11.5v-1a5 5 0 0 1 5-5h11', 'M7 21.5l-3-3 3-3', 'M20 12.5v1a5 5 0 0 1-5 5H4'],
  volume: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  copy: ['M8 8h11v12H8z', 'M5 16V4h11'],
  dice: ['M4.5 4.5h15v15h-15z', 'M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 19.5h14'],
  chevron: ['M7 10l5 5 5-5'],
  autoplay: ['M5 5.5v13l8-6.5z', 'M15 6v12M19 6v12'],
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4h-4'],
  info: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M12 11v5.5M12 7.5h.01'],
  trash: ['M5 7h14', 'M9.5 7V4.5h5V7', 'M7 7l1 13h8l1-13'],
  close: ['M6 6l12 12M18 6 6 18'],
};

const FILLED = new Set(['play', 'pause']);

/** Crée une icône : icon('play'), icon('star', { filled: true }). */
export function icon(name, { size = 18, filled = false, className = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ico ${className}`.trim());
  const fill = filled || FILLED.has(name);
  svg.setAttribute('fill', fill ? 'currentColor' : 'none');
  svg.setAttribute('stroke', fill ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of PATHS[name] ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
