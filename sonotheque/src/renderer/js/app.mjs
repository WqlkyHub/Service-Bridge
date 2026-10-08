// Point d'entrée de l'interface : état partagé, onglets, raccourcis clavier, glisser-déposer.

import { h, $, Emitter } from './dom.mjs';
import { Player } from './player.mjs';
import { LibraryView } from './library-view.mjs';
import { OnlineView } from './online-view.mjs';
import { GenerateView } from './generate-view.mjs';
import { icon } from './icons.mjs';
import { importDialog, settingsDialog } from './dialogs.mjs';
import { isModalOpen } from './modal.mjs';
import { toast } from './toast.mjs';
import { hideTooltip } from './tooltip.mjs';

const sono = window.sono;

// Préférences purement locales à cette fenêtre (pas critiques si perdues).
const prefs = {
  autoplay: readPref('autoplay', true),
};
function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(`sono.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(`sono.${key}`, JSON.stringify(value));
  } catch { /* stockage indisponible : tant pis */ }
}

class Store extends Emitter {
  items = new Map();
  settings = null;
  sources = [];
  libraryRoot = '';

  setItems(list) {
    this.items = new Map(list.map((it) => [it.id, it]));
    this.emit('items', { kind: 'reset' });
  }

  setSettings(settings, sources) {
    this.settings = settings;
    if (sources) this.sources = sources;
    this.emit('settings');
  }
}

async function main() {
  const data = await sono.init();
  const store = new Store();
  store.settings = data.settings;
  store.sources = data.sources;
  store.libraryRoot = data.library.root;
  store.items = new Map(data.library.items.map((it) => [it.id, it]));

  // Icônes de la barre du haut (balises data-icon du HTML).
  for (const el of document.querySelectorAll('[data-icon]')) el.replaceWith(icon(el.dataset.icon, { size: el.classList.contains('chev') ? 14 : 16, className: el.className }));

  const player = new Player($('#player'), {
    volume: data.settings.volume,
    onVolume: debounceSave((v) => sono.settings.update({ volume: v }), 400),
    autoplay: prefs.autoplay,
    onAutoplay: (on) => writePref('autoplay', on),
  });

  let activeTab = 'library';
  const ctx = {
    store,
    player,
    prefs,
    importPick: async (mode) => {
      const paths = await sono.library.pick(mode);
      if (paths.length) importDialog(paths, { settings: store.settings });
    },
    goGenerate: () => switchTab('generate'),
    goOnline: (q) => {
      switchTab('online');
      if (q) online.setQuery(q);
      else online.focusSearch();
    },
    showInLibrary: (id) => {
      switchTab('library');
      library.reveal(id);
    },
    onLibraryChanged: (r) => {
      store.libraryRoot = r.library.root;
      store.setSettings(r.settings);
      store.setItems(r.library.items);
    },
  };

  const library = new LibraryView($('#view-library'), ctx);
  const online = new OnlineView($('#view-online'), ctx);
  const generate = new GenerateView($('#view-generate'), ctx);
  const views = { library, online, generate };

  // --- En-tête -------------------------------------------------------------
  const tabs = {
    library: $('#tab-library'),
    online: $('#tab-online'),
    generate: $('#tab-generate'),
  };
  const libCount = $('#lib-count');
  const updateCount = () => { libCount.textContent = String(store.items.size); };
  updateCount();

  function switchTab(tab) {
    activeTab = tab;
    hideTooltip();
    for (const [id, el] of Object.entries(tabs)) {
      el.classList.toggle('active', id === tab);
      el.setAttribute('aria-selected', String(id === tab));
      $(`#view-${id}`).hidden = id !== tab;
    }
    if (tab === 'generate') generate.activate();
    // Les lignes dessinées pendant que l'onglet était caché n'ont pas leur forme d'onde.
    if (tab === 'library') library.list.refresh();
  }
  tabs.library.addEventListener('click', () => { switchTab('library'); library.focusSearch(); });
  tabs.online.addEventListener('click', () => { switchTab('online'); online.focusSearch(); });
  tabs.generate.addEventListener('click', () => switchTab('generate'));

  // Menu « Importer »
  const importBtn = $('#btn-import');
  const importMenu = $('#import-menu');
  const closeMenu = () => {
    importMenu.hidden = true;
    importBtn.setAttribute('aria-expanded', 'false');
  };
  importBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    importMenu.hidden = !importMenu.hidden;
    importBtn.setAttribute('aria-expanded', String(!importMenu.hidden));
    if (!importMenu.hidden) importMenu.querySelector('button').focus();
  });
  importMenu.addEventListener('click', (e) => {
    const mode = e.target.closest('button')?.dataset.mode;
    closeMenu();
    if (mode) ctx.importPick(mode);
  });
  document.addEventListener('click', closeMenu);
  importMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); importBtn.focus(); } });
  $('#btn-settings').addEventListener('click', () => settingsDialog(ctx));

  const commercial = $('#toggle-commercial');
  commercial.checked = store.settings.commercialOnly;
  commercial.addEventListener('change', async () => {
    const r = await sono.settings.update({ commercialOnly: commercial.checked });
    store.setSettings(r.settings, r.sources);
    toast(commercial.checked
      ? 'Usage commercial : seuls les sons libres ou à créditer sont affichés.'
      : 'Tous les sons sont affichés (vérifie la licence avant usage).', 'info');
  });


  store.on('items', updateCount);
  store.on('settings', () => { commercial.checked = store.settings.commercialOnly; });

  // --- Changements venant du processus principal ---------------------------
  sono.library.onChanged((change) => {
    if (change.kind === 'remove') {
      for (const id of change.ids) store.items.delete(id);
    } else {
      for (const it of change.items) store.items.set(it.id, it);
    }
    store.emit('items', change);
  });

  // --- Glisser des fichiers depuis l'Explorateur ---------------------------
  const dropZone = $('#drop-zone');
  let dragDepth = 0;
  const isFileDrag = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    dragDepth++;
    dropZone.hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!isFileDrag(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (isFileDrag(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZone.hidden = true;
    const paths = [...(e.dataTransfer?.files ?? [])].map((f) => sono.pathForFile(f)).filter(Boolean);
    if (paths.length) importDialog(paths, { settings: store.settings });
  });

  // --- Raccourcis clavier --------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (isModalOpen()) return;
    const view = views[activeTab];
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); view.focusSearch(); return; }
    if (mod && e.key === '1') { e.preventDefault(); switchTab('library'); library.focusSearch(); return; }
    if (mod && e.key === '2') { e.preventDefault(); switchTab('online'); online.focusSearch(); return; }
    if (mod && e.key === '3') { e.preventDefault(); switchTab('generate'); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); ctx.importPick('files'); return; }
    if (e.key === 'Escape') {
      if (e.target.classList?.contains('search') && e.target.value) {
        // Échap vide la recherche (et met la liste à jour).
        e.target.value = '';
        e.target.dispatchEvent(new Event('input'));
        return;
      }
      if (inField) e.target.blur();
      hideTooltip();
      return;
    }
    if (inField) return;
    if (activeTab === 'generate') {
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'l' || e.key === 'L') player.setLoop(!player.audio.loop);
      return;
    }

    switch (e.key) {
      case '/': e.preventDefault(); view.focusSearch(); break;
      case ' ':
        e.preventDefault();
        // Espace : joue le son sélectionné, ou met en pause / reprend s'il est déjà chargé.
        if (view.current() && player.currentKey !== view.playerKey(view.current())) view.playIndex(view.cursor);
        else player.toggle();
        break;
      case 'ArrowDown': e.preventDefault(); view.moveCursor(1); break;
      case 'ArrowUp': e.preventDefault(); view.moveCursor(-1); break;
      case 'ArrowLeft': e.preventDefault(); player.seekBy(-3); break;
      case 'ArrowRight': e.preventDefault(); player.seekBy(3); break;
      case 'Enter':
        e.preventDefault();
        if (activeTab === 'online') online.add(online.current(), { quick: e.shiftKey });
        else if (view.current()) view.playIndex(view.cursor);
        break;
      case 'l': case 'L': player.setLoop(!player.audio.loop); break;
      case 'f': case 'F': if (activeTab === 'library') library.toggleFavorite(); break;
      case 'e': case 'E': if (activeTab === 'library') library.edit(); break;
      case 'Delete': if (activeTab === 'library') library.removeSelected(); break;
      default: break;
    }
  });

  $('#help-btn').addEventListener('click', showHelp);

  switchTab('library');
  library.update();
  library.focusSearch();
}

function debounceSave(fn, ms) {
  let t;
  return (v) => {
    clearTimeout(t);
    t = setTimeout(() => fn(v), ms);
  };
}

function showHelp() {
  import('./modal.mjs').then(({ openModal }) => {
    const keys = [
      ['Ctrl + F  ou  /', 'Aller dans la recherche'],
      ['↑ ↓', 'Son précédent / suivant (écoute auto si activée)'],
      ['Espace', 'Lecture / pause'],
      ['← →', 'Reculer / avancer de 3 s'],
      ['Entrée', 'Écouter (bibliothèque) · Ajouter (en ligne)'],
      ['Maj + Entrée', 'Ajout direct avec les mots-clés proposés (en ligne)'],
      ['L', 'Lecture en boucle'],
      ['F', 'Favori'],
      ['E', 'Modifier les mots-clés'],
      ['Suppr', 'Supprimer la sélection'],
      ['Ctrl + 1 / 2 / 3', 'Bibliothèque / En ligne / Générer'],
      ['Ctrl + I', 'Importer des fichiers'],
      ['Glisser une ligne', 'Déposer le son dans Premiere Pro / DaVinci Resolve'],
      ['Ctrl / Maj + clic', 'Sélection multiple (pour glisser plusieurs sons)'],
    ];
    openModal({
      title: 'Raccourcis',
      body: h('table', { class: 'keys' }, keys.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))),
      actions: [{ label: 'OK', primary: true }],
    });
  });
}

main().catch((err) => {
  console.error(err);
  document.body.append(h('div', { class: 'fatal' }, `Erreur au démarrage : ${err.message}`));
});
