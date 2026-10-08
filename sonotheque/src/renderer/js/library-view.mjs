// Vue « Ma bibliothèque » : recherche instantanée par mots-clés, écoute, glisser vers le montage.

import { h, clear, formatDurationShort, debounce } from './dom.mjs';
import { VirtualList } from './virtual-list.mjs';
import { provenance, sourceCard, categoryLabel, categoryTag } from './badges.mjs';
import { icon } from './icons.mjs';
import { attachTooltip, hideTooltip } from './tooltip.mjs';
import { drawPeaks, decodePeaks, queuePeaks } from './waveform.mjs';
import { editDialog, creditFor } from './dialogs.mjs';
import { confirmDialog } from './modal.mjs';
import { toast } from './toast.mjs';
import { searchLibrary, indexItem } from '../../shared/search.mjs';
import { MEDIA_KINDS, isPlayable } from '../../shared/media-kinds.mjs';

const sono = window.sono;
const ROW_HEIGHT = 60;

export class LibraryView {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.store = ctx.store;
    this.player = ctx.player;
    this.query = '';
    this.category = null;
    this.favoritesOnly = false;
    this.sort = 'relevance';
    this.results = [];
    this.selected = new Set();
    this.cursor = -1;
    this.anchor = -1;
    this.indexCache = new WeakMap();

    this.build(root);
    // Regroupe les mises à jour rapprochées (formes d'onde calculées en arrière-plan…).
    const refresh = debounce(() => this.update({ keepScroll: true }), 150);
    this.store.on('items', (changed) => {
      if (changed?.items) this.onItemsChanged(changed.items);
      refresh();
    });
    this.store.on('settings', () => this.update({ keepScroll: true }));
    this.player.on('state', ({ key }) => {
      this.refreshByPlayerKey(this.lastPlayerKey);
      this.refreshByPlayerKey(key);
      this.lastPlayerKey = key;
    });
  }

  build(root) {
    this.search = h('input', {
      class: 'search', type: 'text', placeholder: 'Rechercher dans ma bibliothèque : pluie, porte, whoosh…',
      'aria-label': 'Rechercher dans ma bibliothèque', spellcheck: false,
    });
    const runSearch = debounce(() => {
      this.query = this.search.value;
      this.update();
    }, 80);
    this.search.addEventListener('input', runSearch);
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.search.blur();
        this.moveCursor(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.query = this.search.value;
        this.update();
        if (this.results.length) {
          this.setCursor(0);
          this.playIndex(0);
        }
      }
    });

    this.catChips = h('div', { class: 'cat-chips' });
    this.favBtn = h('button', { class: 'chip', type: 'button', title: 'Afficher seulement mes favoris', onclick: () => { this.favoritesOnly = !this.favoritesOnly; this.update(); } }, icon('star', { size: 14 }), 'Favoris');
    this.sortSel = h('select', { class: 'select', 'aria-label': 'Trier', onchange: () => { this.sort = this.sortSel.value; this.update(); } },
      h('option', { value: 'relevance' }, 'Pertinence'),
      h('option', { value: 'recent' }, 'Plus récents'),
      h('option', { value: 'name' }, 'Nom A→Z'),
      h('option', { value: 'duration' }, 'Plus courts'));
    this.count = h('span', { class: 'count' });

    this.listEl = h('div', { class: 'list', tabindex: '-1' });
    this.empty = h('div', { class: 'empty' });
    this.selBar = h('div', { class: 'selbar' });

    root.append(
      h('div', { class: 'toolbar' },
        h('div', { class: 'search-wrap' }, h('span', { class: 'search-icon' }, icon('search', { size: 18 })), this.search),
        h('div', { class: 'filters' }, this.catChips, h('span', { class: 'sep' }), this.favBtn, h('span', { class: 'spacer' }), this.count, this.sortSel)),
      h('div', { class: 'list-wrap' }, this.listEl, this.empty),
      this.selBar,
    );

    this.list = new VirtualList(this.listEl, { rowHeight: ROW_HEIGHT, renderRow: (item, i) => this.renderRow(item, i) });
    this.renderCategoryChips();
  }

  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  setQuery(q) {
    this.search.value = q;
    this.query = q;
    this.update();
  }

  renderCategoryChips() {
    clear(this.catChips);
    const counts = {};
    for (const it of this.store.items.values()) counts[it.category] = (counts[it.category] ?? 0) + 1;
    const all = [[null, { label: 'Tout' }], ...Object.entries(MEDIA_KINDS.audio.categories)];
    for (const [id, c] of all) {
      if (id && !counts[id] && this.category !== id) continue; // on n'affiche que les catégories utilisées
      this.catChips.append(h('button', {
        type: 'button', class: ['chip', this.category === id && 'chip-on'],
        onclick: () => { this.category = this.category === id ? null : id; this.update(); },
      }, id ? h('span', { class: ['dot', `dot-${id}`] }) : null, c.label, id ? h('span', { class: 'n' }, counts[id] ?? 0) : null));
    }
    this.favBtn.classList.toggle('chip-on', this.favoritesOnly);
  }

  getIndex = (item) => {
    let idx = this.indexCache.get(item);
    if (!idx) {
      idx = indexItem(item);
      this.indexCache.set(item, idx);
    }
    return idx;
  };

  update({ keepScroll = false } = {}) {
    const items = [...this.store.items.values()];
    const currentId = this.results[this.cursor]?.id;
    this.results = searchLibrary(items, this.query, {
      category: this.category,
      favoritesOnly: this.favoritesOnly,
      commercialOnly: this.store.settings.commercialOnly,
      sort: this.query.trim() ? this.sort : (this.sort === 'relevance' ? 'recent' : this.sort),
      getIndex: this.getIndex,
    });
    this.cursor = currentId ? this.results.findIndex((r) => r.id === currentId) : -1;
    for (const id of this.selected) if (!this.store.items.has(id)) this.selected.delete(id);
    this.renderCategoryChips();
    this.count.textContent = `${this.results.length} son${this.results.length > 1 ? 's' : ''}${items.length !== this.results.length ? ` sur ${items.length}` : ''}`;
    this.list.setItems(this.results, { keepScroll });
    this.renderEmpty(items.length);
    this.renderSelBar();
    queuePeaks(this.results.slice(0, 400));
  }

  renderEmpty(total) {
    clear(this.empty);
    this.empty.hidden = this.results.length > 0;
    if (this.results.length) return;
    if (!total) {
      this.empty.append(
        h('div', { class: 'empty-icon' }, icon('library', { size: 26 })),
        h('h3', {}, 'Ta bibliothèque est vide'),
        h('p', {}, 'Glisse des fichiers ou des dossiers audio dans cette fenêtre, ou commence par une de ces options.'),
        h('div', { class: 'empty-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.ctx.importPick('files') }, icon('plus', { size: 16 }), 'Importer des fichiers'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.ctx.importPick('folder') }, icon('folder', { size: 16 }), 'Un dossier'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.ctx.goOnline('') }, icon('globe', { size: 16 }), 'Chercher en ligne'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.ctx.goGenerate() }, icon('sparkles', { size: 16 }), 'Générer un son')));
    } else {
      const q = this.query.trim();
      this.empty.append(
        h('div', { class: 'empty-icon' }, icon('search', { size: 26 })),
        h('h3', {}, q ? `Aucun son pour « ${q} »` : 'Aucun son avec ces filtres'),
        this.store.settings.commercialOnly ? h('p', {}, 'Le filtre « Usage commercial » est actif.') : null,
        q ? h('div', { class: 'empty-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.ctx.goOnline(q) }, icon('globe', { size: 16 }), `Chercher « ${q} » en ligne`)) : null);
    }
  }

  renderSelBar() {
    clear(this.selBar);
    const n = this.selected.size;
    this.selBar.hidden = n < 2;
    if (n < 2) return;
    const items = [...this.selected].map((id) => this.store.items.get(id)).filter(Boolean);
    this.selBar.append(
      h('span', {}, h('b', {}, `${n} sons sélectionnés`), ' · glisse-les ensemble dans ta timeline'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => this.copyCredits(items) }, icon('copy', { size: 14 }), 'Copier les crédits'),
      h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => this.removeItems(items) }, icon('trash', { size: 14 }), 'Supprimer'),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { this.selected.clear(); this.list.refresh(); this.renderSelBar(); } }, 'Désélectionner'));
  }

  // --- Lignes ---------------------------------------------------------------

  renderRow(item, index) {
    const playing = this.player.currentKey === `lib:${item.id}` && this.player.playing;
    const row = h('div', {
      class: ['row', this.selected.has(item.id) && 'row-selected', index === this.cursor && 'row-cursor', playing && 'row-playing'],
      role: 'listitem',
      draggable: 'true',
      dataset: { id: item.id },
    });

    const playBtn = h('button', {
      class: 'row-play', type: 'button', 'aria-label': playing ? 'Pause' : `Écouter ${item.name}`,
      onclick: (e) => {
        e.stopPropagation();
        this.setCursor(index);
        if (playing) this.player.toggle();
        else this.playIndex(index);
      },
    }, icon(playing ? 'pause' : 'play', { size: 14 }));

    const wave = h('canvas', { class: 'row-wave', 'aria-hidden': 'true' });
    requestAnimationFrame(() => drawPeaks(wave, decodePeaks(item.peaks), { color: getWaveColor(), playedColor: getWaveColor() }));

    const meta = h('div', { class: 'row-meta' }, categoryTag(item.category),
      item.keywords.map((k) => h('button', {
        class: 'kw', type: 'button', title: `Chercher « ${k} »`,
        onclick: (e) => { e.stopPropagation(); this.setQuery(k); },
      }, k)));

    const fav = h('button', {
      class: ['icon-btn', item.favorite && 'fav-on'], type: 'button', title: item.favorite ? 'Retirer des favoris (F)' : 'Ajouter aux favoris (F)',
      onclick: (e) => { e.stopPropagation(); sono.library.update(item.id, { favorite: !item.favorite }); },
    }, icon('star', { size: 16, filled: item.favorite }));

    row.append(
      playBtn,
      wave,
      h('div', { class: 'row-main' }, h('div', { class: 'row-name' }, item.name), meta),
      h('div', { class: 'row-dur' }, formatDurationShort(item.duration)),
      provenance(item.source),
      h('div', { class: 'row-actions' },
        fav,
        h('button', { class: 'icon-btn', type: 'button', title: 'Modifier (E)', onclick: (e) => { e.stopPropagation(); this.edit(item); } }, icon('edit', { size: 16 })),
        h('button', { class: 'icon-btn', type: 'button', title: "Afficher dans l'Explorateur", onclick: (e) => { e.stopPropagation(); sono.library.reveal(item.id); } }, icon('folder', { size: 16 }))),
    );

    row.addEventListener('click', (e) => this.onRowClick(e, index));
    row.addEventListener('dblclick', () => this.playIndex(index));
    row.addEventListener('dragstart', (e) => {
      e.preventDefault();
      hideTooltip();
      const ids = this.selected.has(item.id) ? [...this.selected] : [item.id];
      sono.library.startDrag(ids);
    });
    attachTooltip(row, () => sourceCard({
      title: item.name,
      source: item.source,
      duration: item.duration,
      size: item.size,
      addedAt: item.addedAt,
      file: item.file,
      tags: item.tags,
      note: "Glisse la ligne dans Premiere Pro ou DaVinci Resolve pour l'ajouter au montage.",
    }), `lib:${item.id}`);
    return row;
  }

  onRowClick(e, index) {
    const item = this.results[index];
    if (e.shiftKey && this.anchor >= 0) {
      const [a, b] = [Math.min(this.anchor, index), Math.max(this.anchor, index)];
      if (!e.ctrlKey) this.selected.clear();
      for (let i = a; i <= b; i++) this.selected.add(this.results[i].id);
    } else if (e.ctrlKey || e.metaKey) {
      if (this.selected.has(item.id)) this.selected.delete(item.id);
      else this.selected.add(item.id);
      this.anchor = index;
    } else {
      this.selected = new Set([item.id]);
      this.anchor = index;
    }
    this.cursor = index;
    this.list.refresh();
    this.renderSelBar();
  }

  // --- Actions --------------------------------------------------------------

  setCursor(index) {
    if (index < 0 || index >= this.results.length) return;
    this.cursor = index;
    this.anchor = index;
    this.selected = new Set([this.results[index].id]);
    this.list.scrollToIndex(index);
    this.list.refresh();
    this.renderSelBar();
  }

  moveCursor(delta) {
    if (!this.results.length) return;
    const next = this.cursor < 0 ? 0 : Math.max(0, Math.min(this.results.length - 1, this.cursor + delta));
    this.setCursor(next);
    if (this.ctx.prefs.autoplay) this.playIndex(next);
  }

  current() {
    return this.results[this.cursor] ?? null;
  }

  playerKey(item) {
    return `lib:${item.id}`;
  }

  refreshByPlayerKey(key) {
    if (!key?.startsWith('lib:')) return;
    const i = this.results.findIndex((r) => r.id === key.slice(4));
    if (i >= 0) this.list.refreshIndex(i);
  }

  playIndex(index) {
    const item = this.results[index];
    if (!item) return;
    if (!isPlayable(item.kind, item.ext)) {
      toast(`Le lecteur intégré ne lit pas le format ${item.ext.toUpperCase()}. Glisse-le directement dans ton logiciel de montage.`, 'error', 5000);
      return;
    }
    this.player.play(this.playerEntry(item));
    sono.library.update(item.id, { playCount: (item.playCount ?? 0) + 1 });
  }

  playerEntry(item) {
    const credit = creditFor(item);
    return {
      key: `lib:${item.id}`,
      url: sono.library.fileUrl(item.id),
      title: item.name,
      subtitle: [categoryLabel(item.category), item.keywords.join(', ')].filter(Boolean).join(' · '),
      peaks: item.peaks,
      duration: item.duration,
      actions: [
        h('button', { class: 'icon-btn', type: 'button', title: "Afficher le fichier dans l'Explorateur", onclick: () => sono.library.reveal(item.id) }, icon('folder', { size: 16 })),
        credit ? h('button', { class: 'btn btn-sm', type: 'button', title: 'Copier la ligne de crédit', onclick: () => { sono.copy(credit); toast('Crédit copié.', 'ok'); } }, icon('copy', { size: 14 }), 'Crédit') : null,
      ].filter(Boolean),
    };
  }

  /** Appelé quand un son change (forme d'onde calculée, mots-clés modifiés…). */
  onItemsChanged(items) {
    for (const it of items) {
      this.player.setPeaks(`lib:${it.id}`, it.peaks);
    }
  }

  /** Affiche un son précis (filtres retirés) et le sélectionne. */
  reveal(id) {
    this.category = null;
    this.favoritesOnly = false;
    this.setQuery('');
    const i = this.results.findIndex((r) => r.id === id);
    if (i >= 0) this.setCursor(i);
  }

  toggleFavorite() {
    const item = this.current();
    if (item) sono.library.update(item.id, { favorite: !item.favorite });
  }

  edit(item = this.current()) {
    if (item) editDialog(item);
  }

  async removeSelected() {
    const items = [...this.selected].map((id) => this.store.items.get(id)).filter(Boolean);
    if (items.length) await this.removeItems(items);
  }

  async removeItems(items) {
    const label = items.length > 1 ? `ces ${items.length} sons` : `« ${items[0].name} »`;
    const ok = await confirmDialog('Supprimer ?', `Retirer ${label} de la bibliothèque ? Les fichiers rangés dans la bibliothèque iront à la corbeille.`, { confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const r = await sono.library.remove(items.map((i) => i.id));
    this.selected.clear();
    toast(`${r.removed} son${r.removed > 1 ? 's' : ''} supprimé${r.removed > 1 ? 's' : ''}.`, 'ok');
  }

  copyCredits(items) {
    const lines = items.map(creditFor).filter(Boolean);
    if (!lines.length) {
      toast('Ces sons sont des fichiers perso : aucun crédit à copier.', 'info');
      return;
    }
    sono.copy(`Sons :\n${lines.join('\n')}`);
    toast(`${lines.length} crédit${lines.length > 1 ? 's' : ''} copié${lines.length > 1 ? 's' : ''} : colle-les dans la description de ta vidéo.`, 'ok', 5000);
  }
}

let waveColor;
function getWaveColor() {
  waveColor ??= getComputedStyle(document.documentElement).getPropertyValue('--wave-row').trim() || '#6b6f8a';
  return waveColor;
}
