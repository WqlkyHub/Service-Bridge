// Vue « Chercher en ligne » : recherche simultanée dans toutes les sources, écoute avant
// téléchargement, source et licence toujours visibles, ajout en 1 clic.

import { h, clear, formatDurationShort } from './dom.mjs';
import { VirtualList } from './virtual-list.mjs';
import { sourceBadge, licenseBadge, sourceCard } from './badges.mjs';
import { attachTooltip, hideTooltip } from './tooltip.mjs';
import { addDialog, defaultChoice, settingsDialog } from './dialogs.mjs';
import { toast } from './toast.mjs';
import { translateQuery } from '../../shared/synonyms.mjs';
import { allowedCommercially } from '../../shared/licenses.mjs';

const sono = window.sono;
const ROW_HEIGHT = 62;

export class OnlineView {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.store = ctx.store;
    this.player = ctx.player;
    this.userQuery = '';
    this.sentQuery = '';
    this.forceOriginal = false;
    this.page = 1;
    this.perSource = new Map();
    this.filterSource = null;
    this.downloads = new Map(); // key -> { received, total }
    this.results = [];
    this.cursor = -1;
    this.searchId = 0;

    this.build(root);
    this.player.on('state', ({ key }) => {
      for (const k of [this.lastPlayerKey, key]) if (k?.startsWith('web:')) this.refreshKey(k.slice(4));
      this.lastPlayerKey = key;
    });
    this.store.on('settings', () => this.render());
    this.store.on('items', (changed) => this.onLibraryChanged(changed));
    sono.online.onProgress(({ key, received, total }) => {
      this.downloads.set(key, { received, total });
      this.refreshKey(key);
    });
  }

  build(root) {
    this.search = h('input', {
      class: 'search', type: 'search', placeholder: 'Chercher un son en ligne : pluie, porte qui grince, whoosh…',
      'aria-label': 'Chercher en ligne', spellcheck: false,
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.forceOriginal = false;
        this.run(this.search.value);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.search.blur();
        this.moveCursor(1);
      }
    });
    const go = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { this.forceOriginal = false; this.run(this.search.value); } }, 'Chercher');

    this.sourceChips = h('div', { class: 'cat-chips' });
    this.info = h('div', { class: 'online-info' });
    this.listEl = h('div', { class: 'list', tabindex: '-1' });
    this.empty = h('div', { class: 'empty' });
    this.more = h('div', { class: 'more-bar' });

    root.append(
      h('div', { class: 'toolbar' },
        h('div', { class: 'search-wrap' }, h('span', { class: 'search-icon', 'aria-hidden': 'true' }, '🌐'), this.search, go),
        h('div', { class: 'filters' }, this.sourceChips),
        this.info),
      h('div', { class: 'list-wrap' }, this.listEl, this.empty),
      this.more,
    );
    this.list = new VirtualList(this.listEl, { rowHeight: ROW_HEIGHT, renderRow: (r, i) => this.renderRow(r, i) });
    this.render();
  }

  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  setQuery(q) {
    this.search.value = q;
    if (q.trim()) this.run(q);
  }

  // --- Recherche ------------------------------------------------------------

  enabledSources() {
    return this.store.sources.filter((s) => s.enabled);
  }

  async run(query, { page = 1 } = {}) {
    const q = String(query).trim();
    if (!q) return;
    hideTooltip();
    const id = ++this.searchId;
    if (page === 1) {
      this.userQuery = q;
      const t = translateQuery(q);
      this.translated = this.store.settings.translateOnline && !this.forceOriginal && t.translated;
      this.sentQuery = this.translated ? t.query || q : q;
      this.perSource = new Map();
      this.cursor = -1;
    }
    this.page = page;

    const sources = this.enabledSources().filter((s) => s.configured && (page === 1 || this.perSource.get(s.id)?.hasMore));
    for (const s of sources) {
      const prev = this.perSource.get(s.id);
      this.perSource.set(s.id, { items: prev?.items ?? [], total: prev?.total ?? 0, hasMore: false, loading: true, error: null });
    }
    this.render();

    await Promise.all(sources.map(async (s) => {
      const res = await sono.online.search({ sourceId: s.id, query: this.sentQuery, page, commercialOnly: this.store.settings.commercialOnly });
      if (id !== this.searchId) return; // une recherche plus récente a été lancée
      const prev = this.perSource.get(s.id);
      if (res.error) {
        this.perSource.set(s.id, { ...prev, loading: false, error: res.error, needsKey: res.needsKey });
      } else {
        this.perSource.set(s.id, { items: [...prev.items, ...res.items], total: res.total, hasMore: res.hasMore, loading: false, error: null });
      }
      this.render({ keepScroll: true });
    }));
  }

  loadMore() {
    this.run(this.userQuery, { page: this.page + 1 });
  }

  /** Mélange les résultats des sources (1 de chaque, à tour de rôle) et applique les filtres. */
  merged() {
    const lists = [...this.perSource.entries()]
      .filter(([id]) => !this.filterSource || id === this.filterSource)
      .map(([, v]) => v.items);
    const out = [];
    const max = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    if (!this.store.settings.commercialOnly) return { items: out, hidden: 0 };
    const items = out.filter((r) => allowedCommercially(r.license));
    return { items, hidden: out.length - items.length };
  }

  render({ keepScroll = false } = {}) {
    const currentKey = this.results[this.cursor]?.key;
    const { items, hidden } = this.merged();
    this.results = items;
    this.cursor = currentKey ? items.findIndex((r) => r.key === currentKey) : this.cursor;
    this.list.setItems(items, { keepScroll });
    this.renderSourceChips();
    this.renderInfo(hidden);
    this.renderEmpty();
    this.renderMore();
  }

  renderSourceChips() {
    clear(this.sourceChips);
    const all = this.enabledSources();
    const totalLoaded = [...this.perSource.values()].reduce((n, v) => n + v.items.length, 0);
    this.sourceChips.append(h('button', {
      type: 'button', class: ['chip', !this.filterSource && 'chip-on'],
      onclick: () => { this.filterSource = null; this.render(); },
    }, `Toutes${this.perSource.size ? ` (${totalLoaded})` : ''}`));
    for (const s of all) {
      const st = this.perSource.get(s.id);
      let label = s.label;
      let title = s.description;
      let cls = '';
      if (!s.configured) {
        label += ' · ⚠ clé';
        title = 'Clé API manquante : clique pour ouvrir les Réglages.';
        cls = 'chip-warn';
      } else if (st?.loading) label += ' · …';
      else if (st?.error) {
        label += ' · ⚠';
        title = st.error;
        cls = 'chip-warn';
      } else if (st) label += ` (${st.total > st.items.length ? `${st.items.length}/${st.total}` : st.items.length})`;
      this.sourceChips.append(h('button', {
        type: 'button', class: ['chip', this.filterSource === s.id && 'chip-on', cls], title,
        onclick: () => {
          if (!s.configured) return settingsDialog(this.ctx);
          this.filterSource = this.filterSource === s.id ? null : s.id;
          this.render();
        },
      }, label));
    }
    this.sourceChips.append(h('button', { type: 'button', class: 'chip chip-ghost', title: 'Activer / désactiver des sources, ajouter des clés', onclick: () => settingsDialog(this.ctx) }, '⚙ Sources'));
  }

  renderInfo(hidden) {
    clear(this.info);
    if (!this.userQuery) {
      this.info.append('Le nom de la source et la licence sont affichés sur chaque son ; survole une ligne pour tous les détails.');
      return;
    }
    if (this.translated) {
      this.info.append(`Recherche envoyée en anglais : « ${this.sentQuery} » `,
        h('button', { class: 'link', type: 'button', onclick: () => { this.forceOriginal = true; this.run(this.userQuery); } }, `(chercher « ${this.userQuery} » tel quel)`));
    } else {
      this.info.append(`Recherche : « ${this.sentQuery} »`);
    }
    if (hidden) this.info.append(h('span', { class: 'warn' }, ` · ${hidden} résultat${hidden > 1 ? 's' : ''} masqué${hidden > 1 ? 's' : ''} (licence non commerciale ou inconnue)`));
    const errors = [...this.perSource.entries()].filter(([, v]) => v.error);
    for (const [id, v] of errors) {
      const s = this.store.sources.find((x) => x.id === id);
      this.info.append(h('div', { class: 'warn' }, `${s?.label ?? id} : ${v.error}`));
    }
  }

  renderEmpty() {
    clear(this.empty);
    const loading = [...this.perSource.values()].some((v) => v.loading);
    this.empty.hidden = this.results.length > 0;
    if (this.results.length) return;
    if (!this.userQuery) {
      this.empty.append(
        h('div', { class: 'empty-icon' }, '🌐'),
        h('h3', {}, 'Trouve de nouveaux sons'),
        h('p', {}, `Tape 1 à 3 mots-clés et Entrée. Sources actives : ${this.enabledSources().map((s) => s.label).join(', ')}.`),
        this.enabledSources().some((s) => !s.configured)
          ? h('p', {}, h('button', { class: 'link', type: 'button', onclick: () => settingsDialog(this.ctx) }, 'Ajoute tes clés gratuites Freesound et Jamendo'), ' pour avoir beaucoup plus de résultats.')
          : null);
    } else if (loading) {
      this.empty.append(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ' Recherche en cours…'));
    } else {
      this.empty.append(h('div', { class: 'empty-icon' }, '🔎'), h('h3', {}, `Aucun résultat pour « ${this.userQuery} »`),
        h('p', {}, 'Essaie un mot plus simple ou en anglais (ex. « door » plutôt que « porte de grange »).'));
    }
  }

  renderMore() {
    clear(this.more);
    const anyMore = [...this.perSource.values()].some((v) => v.hasMore);
    const loading = [...this.perSource.values()].some((v) => v.loading);
    this.more.hidden = !this.results.length;
    if (!this.results.length) return;
    this.more.append(
      h('span', { class: 'count' }, `${this.results.length} résultats affichés`),
      h('span', { class: 'spacer' }),
      anyMore ? h('button', { class: 'btn btn-sm', type: 'button', disabled: loading, onclick: () => this.loadMore() }, loading ? 'Chargement…' : 'Plus de résultats') : null);
  }

  // --- Lignes ---------------------------------------------------------------

  refreshKey(key) {
    const i = this.results.findIndex((r) => r.key === key);
    if (i >= 0) this.list.refreshIndex(i);
  }

  renderRow(r, index) {
    const playing = this.player.currentKey === `web:${r.key}` && this.player.playing;
    const dl = this.downloads.get(r.key);
    const row = h('div', { class: ['row', 'row-online', index === this.cursor && 'row-cursor', playing && 'row-playing'], role: 'listitem' });

    const playBtn = h('button', {
      class: 'row-play', type: 'button', 'aria-label': playing ? 'Pause' : `Écouter ${r.title}`,
      onclick: (e) => {
        e.stopPropagation();
        this.setCursor(index);
        if (playing) this.player.toggle();
        else this.playIndex(index);
      },
    }, playing ? '❚❚' : '▶');

    let action;
    if (r.inLibrary) {
      action = h('button', { class: 'btn btn-sm btn-ok', type: 'button', title: 'Voir dans ma bibliothèque', onclick: (e) => { e.stopPropagation(); this.ctx.showInLibrary(r.inLibrary); } }, '✓ Dans ma biblio');
    } else if (dl) {
      const pct = dl.total ? Math.round((dl.received / dl.total) * 100) : null;
      action = h('div', { class: 'dl-progress', title: 'Téléchargement…' },
        h('div', { class: 'dl-bar', style: { width: `${pct ?? 50}%` } }),
        h('span', {}, pct != null ? `${pct} %` : '…'));
    } else if (r.downloadable === false) {
      action = h('span', { class: 'muted', title: "La source n'autorise pas le téléchargement" }, 'Écoute seule');
    } else {
      action = h('button', {
        class: 'btn btn-sm btn-primary', type: 'button', title: 'Ajouter à ma bibliothèque (Entrée). Maj + clic : ajout direct avec les mots-clés proposés.',
        onclick: (e) => { e.stopPropagation(); this.add(r, { quick: e.shiftKey }); },
      }, '+ Ajouter');
    }

    const meta = [r.author ? `par ${r.author}` : null, r.tags.slice(0, 5).join(', ')].filter(Boolean).join(' · ');
    row.append(
      playBtn,
      h('div', { class: 'row-main' }, h('div', { class: 'row-name' }, r.title), h('div', { class: 'row-meta' }, meta)),
      h('div', { class: 'row-dur' }, formatDurationShort(r.duration)),
      h('div', { class: 'row-src' }, sourceBadge(r)),
      h('div', { class: 'row-lic' }, licenseBadge(r.license)),
      h('div', { class: 'row-actions row-actions-online' }, action),
    );
    row.addEventListener('click', () => this.setCursor(index));
    row.addEventListener('dblclick', () => this.playIndex(index));
    attachTooltip(row, () => sourceCard({
      title: r.title,
      source: r,
      duration: r.duration,
      size: r.filesize,
      quality: r.quality,
      note: r.note,
      tags: r.tags,
    }), `web:${r.key}`);
    return row;
  }

  // --- Actions --------------------------------------------------------------

  setCursor(index) {
    if (index < 0 || index >= this.results.length) return;
    const prev = this.cursor;
    this.cursor = index;
    this.list.scrollToIndex(index);
    this.list.refreshIndex(prev);
    this.list.refreshIndex(index);
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

  playerKey(r) {
    return `web:${r.key}`;
  }

  async playIndex(index) {
    let r = this.results[index];
    if (!r) return;
    if (!r.previewUrl && r.needsResolve) {
      const resolved = await sono.online.resolve(r.key);
      if (resolved.error) {
        toast(resolved.error, 'error');
        return;
      }
      r = this.replaceResult(resolved);
    }
    if (!r.previewUrl) {
      toast("Pas d'aperçu disponible pour ce son.", 'error');
      return;
    }
    this.player.play({
      key: `web:${r.key}`,
      url: r.previewUrl,
      title: r.title,
      subtitle: `Aperçu en ligne · ${r.via ? `${r.providerLabel} › ${r.via}` : r.providerLabel}${r.author ? ` · par ${r.author}` : ''} · ${r.license.label}`,
      duration: r.duration,
      actions: this.playerActions(r),
    });
  }

  playerActions(r) {
    if (r.inLibrary) return [h('span', { class: 'ok-text' }, '✓ Dans ma biblio')];
    if (r.downloadable === false) return [];
    return [h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => this.add(r, { quick: e.shiftKey }) }, '+ Ajouter')];
  }

  /** Remplace un résultat (après résolution) dans toutes les listes. */
  replaceResult(updated) {
    for (const v of this.perSource.values()) {
      const i = v.items.findIndex((x) => x.key === updated.key);
      if (i >= 0) v.items[i] = updated;
    }
    const j = this.results.findIndex((x) => x.key === updated.key);
    if (j >= 0) {
      this.results[j] = updated;
      this.list.refreshIndex(j);
    }
    return updated;
  }

  add(r = this.current(), { quick = false } = {}) {
    if (!r || r.inLibrary || this.downloads.has(r.key) || r.downloadable === false) return;
    if (quick) this.download(r, defaultChoice(r, this.userQuery));
    else addDialog(r, this.userQuery, (choice) => this.download(r, choice));
  }

  async download(r, choice) {
    this.downloads.set(r.key, { received: 0, total: 0 });
    this.refreshKey(r.key);
    const res = await sono.online.download({ key: r.key, ...choice });
    this.downloads.delete(r.key);
    if (res.error) {
      toast(`Échec de l'ajout : ${res.error}`, 'error', 6000);
      this.refreshKey(r.key);
      return;
    }
    const updated = this.replaceResult({ ...r, inLibrary: res.item.id });
    this.player.setActions(`web:${r.key}`, this.playerActions(updated));
    toast(res.already ? 'Ce son est déjà dans ta bibliothèque.' : `Ajouté : « ${res.item.name} » (${res.item.keywords.join(', ')})`, 'ok');
  }

  /** Quand un son est supprimé de la bibliothèque, il redevient « ajoutable ». */
  onLibraryChanged(changed) {
    if (changed?.kind !== 'remove') return;
    const removed = new Set(changed.ids);
    let touched = false;
    for (const v of this.perSource.values()) {
      v.items = v.items.map((x) => {
        if (x.inLibrary && removed.has(x.inLibrary)) {
          touched = true;
          return { ...x, inLibrary: null };
        }
        return x;
      });
    }
    if (touched) this.render({ keepScroll: true });
  }
}
