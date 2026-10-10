// Liste « virtuelle » : seules les lignes visibles sont créées, pour rester fluide
// même avec des dizaines de milliers de sons.

import { h, clear } from './dom.mjs';

export class VirtualList {
  /**
   * @param container  élément qui défile
   * @param rowHeight  hauteur fixe d'une ligne (px)
   * @param renderRow  (item, index) => Element
   */
  constructor(container, { rowHeight, renderRow, overscan = 8 }) {
    this.container = container;
    this.rowHeight = rowHeight;
    this.renderRow = renderRow;
    this.overscan = overscan;
    this.items = [];
    this.spacer = h('div', { class: 'vl-spacer' });
    this.layer = h('div', { class: 'vl-layer', role: 'list' });
    this.spacer.append(this.layer);
    container.append(this.spacer);
    this.rendered = new Map(); // index -> élément
    container.addEventListener('scroll', () => this.paint(), { passive: true });
    new ResizeObserver(() => requestAnimationFrame(() => this.paint())).observe(container);
  }

  setItems(items, { keepScroll = false } = {}) {
    this.items = items;
    this.spacer.style.height = `${items.length * this.rowHeight}px`;
    if (!keepScroll) this.container.scrollTop = 0;
    this.refresh();
  }

  /** Redessine toutes les lignes visibles (après un changement de données). */
  refresh() {
    clear(this.layer);
    this.rendered.clear();
    this.paint();
  }

  /** Redessine une seule ligne si elle est visible. */
  refreshIndex(index) {
    const old = this.rendered.get(index);
    if (!old) return;
    const el = this.makeRow(index);
    old.replaceWith(el);
    this.rendered.set(index, el);
  }

  makeRow(index) {
    const el = this.renderRow(this.items[index], index);
    el.style.transform = `translateY(${index * this.rowHeight}px)`;
    el.style.height = `${this.rowHeight}px`;
    return el;
  }

  paint() {
    const { scrollTop, clientHeight } = this.container;
    const first = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscan);
    const last = Math.min(this.items.length - 1, Math.ceil((scrollTop + clientHeight) / this.rowHeight) + this.overscan);
    for (const [i, el] of this.rendered) {
      if (i < first || i > last) {
        el.remove();
        this.rendered.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      if (this.rendered.has(i)) continue;
      const el = this.makeRow(i);
      this.layer.append(el);
      this.rendered.set(i, el);
    }
  }

  scrollToIndex(index) {
    const top = index * this.rowHeight;
    const { scrollTop, clientHeight } = this.container;
    if (top < scrollTop) this.container.scrollTop = top;
    else if (top + this.rowHeight > scrollTop + clientHeight) this.container.scrollTop = top + this.rowHeight - clientHeight;
  }
}
