// Fenêtres : import de fichiers, ajout d'un son en ligne, modification d'un son, réglages.

import { h, clear, formatDuration, formatSize, hostOf } from './dom.mjs';
import { openModal, confirmDialog } from './modal.mjs';
import { keywordInput } from './keyword-input.mjs';
import { sourceBadge, licenseBadge, sourceName } from './badges.mjs';
import { toast } from './toast.mjs';
import { MEDIA_KINDS, guessCategory } from '../../shared/media-kinds.mjs';
import { suggestFromOnline, cleanKeywords, usefulWords } from '../../shared/keywords.mjs';
import { LEVEL_INFO, creditLine } from '../../shared/licenses.mjs';

const sono = window.sono;
const CATEGORIES = MEDIA_KINDS.audio.categories;
const MAX_ROWS_SHOWN = 300;

function categorySelect(value, { withAuto = false } = {}) {
  return h('select', { class: 'select' },
    withAuto ? h('option', { value: '' }, 'Auto (selon chaque fichier)') : null,
    Object.entries(CATEGORIES).map(([id, c]) => h('option', { value: id, selected: id === value }, `${c.icon} ${c.label}`)));
}

function categoryChips(value, onChange) {
  let current = value;
  const wrap = h('div', { class: 'cat-chips', role: 'radiogroup', 'aria-label': 'Catégorie' });
  const render = () => {
    clear(wrap);
    for (const [id, c] of Object.entries(CATEGORIES)) {
      wrap.append(h('button', {
        type: 'button',
        class: ['chip', id === current && 'chip-on'],
        role: 'radio',
        'aria-checked': String(id === current),
        onclick: () => { current = id; render(); onChange?.(id); },
      }, `${c.icon} ${c.label}`));
    }
  };
  render();
  return { el: wrap, get value() { return current; } };
}

function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Ligne de crédit pour un son de la bibliothèque (null pour un fichier perso). */
export function creditFor(item) {
  const s = item.source;
  if (!s || s.provider === 'local') return null;
  return creditLine({ title: s.title || item.name, author: s.author, sourceLabel: sourceName(s), license: s.license, pageUrl: s.pageUrl });
}

function licenseWarning(license) {
  const info = LEVEL_INFO[license?.level] ?? LEVEL_INFO.unknown;
  return h('div', { class: ['license-box', `lic-box-${info.color}`] },
    licenseBadge(license),
    h('span', {}, info.help),
    license?.url ? h('button', { class: 'link', type: 'button', onclick: () => sono.openExternal(license.url) }, 'Lire la licence ↗') : null);
}

// ---------------------------------------------------------------------------
// Import de fichiers locaux

export async function importDialog(paths, { settings }) {
  const body = h('div', { class: 'import' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ` Analyse de ${paths.length > 1 ? 'tes fichiers' : 'ton fichier'}…`));
  const modal = openModal({ title: 'Importer des sons', body, size: 'wide' });

  let entries;
  try {
    entries = await sono.library.analyze(paths);
  } catch (err) {
    clear(body).append(h('p', { class: 'modal-text' }, `Analyse impossible : ${err.message}`));
    return;
  }
  if (!document.body.contains(modal.dialog)) return; // fermée entre-temps
  modal.close();

  if (!entries.length) {
    toast('Aucun fichier audio reconnu (formats acceptés : WAV, MP3, FLAC, OGG, M4A, AIFF…).', 'error', 5000);
    return;
  }

  const usable = entries.filter((e) => !e.error);
  const common = keywordInput({ placeholder: 'ex. : pluie, nuit (ajoutés à tous les fichiers)' });
  const commonCat = categorySelect('', { withAuto: true });
  const copy = h('input', { type: 'checkbox', checked: settings.copyOnImport !== false });

  const rows = [];
  const list = h('div', { class: 'import-list' });
  entries.slice(0, MAX_ROWS_SHOWN).forEach((e) => {
    const include = h('input', { type: 'checkbox', checked: !e.error && !e.duplicateOf, disabled: Boolean(e.error), 'aria-label': `Importer ${e.name}` });
    const name = h('input', { class: 'input input-sm', type: 'text', value: e.name, 'aria-label': 'Nom' });
    const kw = keywordInput({ value: e.keywords, placeholder: 'mots-clés…' });
    const cat = categorySelect(e.category);
    const warn = e.error ? h('span', { class: 'warn warn-red' }, e.error)
      : e.duplicateOf ? h('span', { class: 'warn' }, `Déjà dans ta bibliothèque (« ${e.duplicateOf.name} »)`)
        : null;
    rows.push({ e, include, name, kw, cat });
    list.append(h('div', { class: ['import-row', e.error && 'import-row-error'] },
      include,
      h('div', { class: 'import-file' }, name,
        h('div', { class: 'import-meta' }, `${e.ext.toUpperCase()} · ${formatDuration(e.duration)} · ${formatSize(e.size)}`, warn ? ' · ' : '', warn)),
      kw.el,
      cat));
  });
  // Au-delà de 300 fichiers, les suivants sont importés avec les suggestions automatiques.
  const hidden = entries.slice(MAX_ROWS_SHOWN).filter((e) => !e.error && !e.duplicateOf);

  const summary = h('p', { class: 'modal-text' },
    `${usable.length} fichier${usable.length > 1 ? 's' : ''} audio trouvé${usable.length > 1 ? 's' : ''}. `,
    'Les mots-clés sont proposés à partir du nom des fichiers et des dossiers : corrige-les si besoin (1 à 3 mots).',
    hidden.length ? ` Les ${hidden.length} fichiers non affichés seront importés avec les mots-clés proposés.` : '');

  openModal({
    title: `Importer ${usable.length} son${usable.length > 1 ? 's' : ''}`,
    size: 'wide',
    body: [
      summary,
      h('div', { class: 'import-common' },
        field('Mots-clés pour tous les fichiers', common.el),
        field('Catégorie pour tous', commonCat)),
      list,
      h('label', { class: 'check' }, copy, ' Copier les fichiers dans la bibliothèque (recommandé : tes originaux restent intacts)'),
    ],
    actions: [
      { label: 'Annuler' },
      {
        label: 'Importer',
        primary: true,
        onClick: async () => {
          const commonKw = common.value;
          const forcedCat = commonCat.value;
          const chosen = rows.filter((r) => r.include.checked).map((r) => ({
            path: r.e.path,
            name: r.name.value.trim() || r.e.name,
            keywords: cleanKeywords([...commonKw, ...r.kw.value]),
            category: forcedCat || r.cat.value,
          }));
          for (const e of hidden) {
            chosen.push({ path: e.path, name: e.name, keywords: cleanKeywords([...commonKw, ...e.keywords]), category: forcedCat || e.category });
          }
          if (!chosen.length) {
            toast('Aucun fichier sélectionné.', 'error');
            return false;
          }
          toast(`Import de ${chosen.length} son${chosen.length > 1 ? 's' : ''}…`);
          const res = await sono.library.import(chosen, { copy: copy.checked });
          const parts = [`${res.added.length} son${res.added.length > 1 ? 's' : ''} ajouté${res.added.length > 1 ? 's' : ''}`];
          if (res.skipped.length) parts.push(`${res.skipped.length} déjà présent${res.skipped.length > 1 ? 's' : ''}`);
          if (res.errors.length) parts.push(`${res.errors.length} en erreur`);
          toast(parts.join(' · '), res.errors.length ? 'error' : 'ok', 5000);
          return true;
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Ajout d'un son trouvé en ligne

/**
 * @param result     résultat en ligne
 * @param userQuery  ce que l'utilisateur a tapé (dans sa langue) — sert aux suggestions
 * @param onConfirm  ({ keywords, category, name }) => void
 */
export function addDialog(result, userQuery, onConfirm) {
  const defaults = defaultChoice(result, userQuery);
  const name = h('input', { class: 'input', type: 'text', value: defaults.name, 'aria-label': 'Nom du son' });
  const cats = categoryChips(defaults.category);
  let modal;
  const kw = keywordInput({
    value: defaults.keywords,
    suggestions: suggestFromOnline('', result.tags, result.title, 8),
    autofocus: true,
    onSubmit: () => modal?.submit(),
  });

  modal = openModal({
    title: 'Ajouter à ma bibliothèque',
    body: [
      h('div', { class: 'add-head' },
        h('div', { class: 'add-title' }, result.title),
        h('div', { class: 'add-src' },
          'Source : ', sourceBadge(result),
          result.author ? h('span', {}, ` par ${result.author}`) : null,
          result.pageUrl ? h('button', { class: 'link', type: 'button', onclick: () => sono.openExternal(result.pageUrl) }, ` Voir sur ${hostOf(result.pageUrl)} ↗`) : null),
        h('div', { class: 'add-meta' }, [formatDuration(result.duration), result.quality].filter(Boolean).join(' · '))),
      licenseWarning(result.license),
      field('Mots-clés (1 à 3)', kw.el, 'Entrée pour ajouter tout de suite. Astuce : Maj + clic sur « Ajouter » ajoute sans ouvrir cette fenêtre.'),
      field('Catégorie', cats.el),
      field('Nom', name),
    ],
    actions: [
      { label: 'Annuler' },
      {
        label: 'Ajouter',
        primary: true,
        onClick: () => {
          const keywords = kw.value;
          if (!keywords.length) {
            toast('Ajoute au moins un mot-clé.', 'error');
            kw.focus();
            return false;
          }
          onConfirm({ keywords, category: cats.value, name: name.value.trim() || defaults.name });
          return true;
        },
      },
    ],
  });
}

/** Choix par défaut (ajout rapide sans fenêtre). */
export function defaultChoice(result, userQuery) {
  const words = [...usefulWords(userQuery), ...result.tags.flatMap(usefulWords), ...usefulWords(result.title)];
  return {
    name: result.title.replace(/\.(wav|mp3|flac|ogg|aiff?|m4a)$/i, '').trim(),
    keywords: suggestFromOnline(userQuery, result.tags, result.title),
    category: guessCategory(words, result.duration, { isMusicSource: result.provider === 'jamendo' }),
  };
}

// ---------------------------------------------------------------------------
// Modification d'un son de la bibliothèque

export function editDialog(item, { onDeleted } = {}) {
  const name = h('input', { class: 'input', type: 'text', value: item.name, 'aria-label': 'Nom' });
  const kw = keywordInput({ value: item.keywords, suggestions: item.tags?.slice(0, 8) ?? [] });
  const cats = categoryChips(item.category);
  const notes = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'Notes perso (optionnel)…' }, item.notes ?? '');
  const s = item.source ?? {};
  const credit = creditFor(item);

  openModal({
    title: 'Modifier le son',
    body: [
      field('Nom', name),
      field('Mots-clés (1 à 3)', kw.el),
      field('Catégorie', cats.el),
      field('Notes', notes),
      h('div', { class: 'edit-source' },
        h('div', { class: 'edit-source-title' }, 'Provenance'),
        h('div', { class: 'add-src' }, sourceBadge(s), s.author ? ` par ${s.author}` : '',
          s.pageUrl ? h('button', { class: 'link', type: 'button', onclick: () => sono.openExternal(s.pageUrl) }, ` Page d'origine ↗`) : null),
        s.provider === 'local' && s.originalPath ? h('div', { class: 'field-hint' }, `Fichier d'origine : ${s.originalPath}`) : null,
        licenseWarning(s.license),
        h('div', { class: 'edit-buttons' },
          credit ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { sono.copy(credit); toast('Crédit copié : colle-le dans la description de ta vidéo.', 'ok'); } }, '📋 Copier le crédit') : null,
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => sono.library.reveal(item.id) }, '📂 Afficher dans l\'Explorateur'))),
    ],
    actions: [
      {
        label: 'Supprimer',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog('Supprimer ce son ?', `« ${item.name} » sera retiré de la bibliothèque et son fichier mis à la corbeille.`, { confirmLabel: 'Supprimer', danger: true });
          if (!ok) return false;
          await sono.library.remove([item.id]);
          onDeleted?.();
          toast('Son supprimé (fichier dans la corbeille).', 'ok');
          return true;
        },
      },
      { label: 'Annuler' },
      {
        label: 'Enregistrer',
        primary: true,
        onClick: async () => {
          await sono.library.update(item.id, { name: name.value, keywords: kw.value, category: cats.value, notes: notes.value });
          return true;
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Réglages

export function settingsDialog(ctx) {
  const { store } = ctx;
  const st = store.settings;
  const libPath = h('code', { class: 'path' }, store.libraryRoot);

  const fsKey = h('input', { class: 'input', type: 'password', placeholder: st.freesound.hasApiKey ? '•••••••• (enregistrée)' : 'Colle ta clé API Freesound', autocomplete: 'off' });
  const fsClient = h('input', { class: 'input', type: 'text', value: st.freesound.clientId ?? '', placeholder: 'Client ID Freesound', autocomplete: 'off' });
  const jmClient = h('input', { class: 'input', type: 'password', placeholder: st.jamendo.hasClientId ? '•••••••• (enregistré)' : 'Colle ton Client ID Jamendo', autocomplete: 'off' });
  const translate = h('input', { type: 'checkbox', checked: st.translateOnline });
  const copyImport = h('input', { type: 'checkbox', checked: st.copyOnImport });
  const fsStatus = h('div', { class: 'fs-status' });

  const sourceToggles = {};
  const sourceList = h('div', { class: 'source-list' }, store.sources.map((s) => {
    const cb = h('input', { type: 'checkbox', checked: s.enabled });
    sourceToggles[s.id] = cb;
    return h('label', { class: 'source-item' }, cb,
      h('div', {},
        h('div', { class: 'source-name' }, s.label, s.needsKey && !s.configured ? h('span', { class: 'warn' }, ' · clé manquante') : null),
        h('div', { class: 'field-hint' }, s.description)));
  }));

  function renderFsStatus() {
    clear(fsStatus);
    const cur = store.settings.freesound;
    if (cur.connected) {
      fsStatus.append(h('span', { class: 'ok-text' }, '✓ Compte connecté : téléchargement des fichiers originaux (WAV/FLAC).'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
          const r = await sono.settings.disconnectFreesound();
          store.setSettings(r.settings);
          renderFsStatus();
        } }, 'Déconnecter'));
    } else {
      fsStatus.append(h('span', { class: 'field-hint' }, 'Sans connexion, Freesound fournit un aperçu MP3 de bonne qualité. Connecte ton compte pour les fichiers originaux.'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
          await save(false);
          const r = await sono.settings.connectFreesound();
          store.setSettings(r.settings);
          if (r.error) toast(r.error, 'error', 6000);
          else toast('Compte Freesound connecté.', 'ok');
          renderFsStatus();
        } }, 'Connecter mon compte Freesound'));
    }
  }
  renderFsStatus();

  async function save(close = true) {
    const patch = {
      translateOnline: translate.checked,
      copyOnImport: copyImport.checked,
      sources: Object.fromEntries(Object.entries(sourceToggles).map(([id, cb]) => [id, cb.checked])),
      freesound: { clientId: fsClient.value },
    };
    if (fsKey.value.trim()) patch.freesound.apiKey = fsKey.value;
    if (jmClient.value.trim()) patch.jamendo = { clientId: jmClient.value };
    const r = await sono.settings.update(patch);
    store.setSettings(r.settings, r.sources);
    if (close) toast('Réglages enregistrés.', 'ok');
    return true;
  }

  const link = (url, label) => h('button', { class: 'link', type: 'button', onclick: () => sono.openExternal(url) }, label);

  openModal({
    title: 'Réglages',
    size: 'wide',
    body: [
      h('section', { class: 'settings-section' },
        h('h3', {}, 'Bibliothèque'),
        h('div', { class: 'row-inline' }, 'Dossier : ', libPath),
        h('div', { class: 'row-inline' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => sono.library.openRoot() }, '📂 Ouvrir le dossier'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
            const r = await sono.settings.pickLibrary();
            if (r) {
              ctx.onLibraryChanged(r);
              libPath.textContent = r.library.root;
              toast('Bibliothèque changée.', 'ok');
            }
          } }, 'Changer de dossier…')),
        h('p', { class: 'field-hint' }, "Tes sons et l'index des mots-clés sont dans ce dossier ; une sauvegarde de l'index est faite chaque jour (7 jours gardés). Tu peux le mettre sur un disque externe."),
        h('label', { class: 'check' }, copyImport, ' À l\'import, copier les fichiers dans la bibliothèque')),

      h('section', { class: 'settings-section' },
        h('h3', {}, 'Recherche en ligne'),
        h('label', { class: 'check' }, translate, ' Traduire ma recherche en anglais (« pluie » → « rain ») : les banques de sons sont surtout en anglais'),
        sourceList),

      h('section', { class: 'settings-section' },
        h('h3', {}, 'Freesound'),
        h('p', { class: 'field-hint' }, '1. Crée un compte gratuit sur freesound.org. 2. ', link('https://freesound.org/apiv2/apply', 'Demande une clé API ↗'),
          ' (formulaire court, accepté tout de suite). 3. Copie ici le « Client secret/Api key » et le « Client id ».'),
        field('Clé API (Client secret / Api key)', fsKey),
        field('Client ID (pour connecter ton compte)', fsClient),
        fsStatus),

      h('section', { class: 'settings-section' },
        h('h3', {}, 'Jamendo (musiques)'),
        h('p', { class: 'field-hint' }, '1. Crée un compte développeur gratuit sur ', link('https://devportal.jamendo.com', 'devportal.jamendo.com ↗'),
          '. 2. Crée une application (nom au choix). 3. Copie ici son « Client ID ».'),
        field('Client ID', jmClient)),

      h('p', { class: 'field-hint' }, st.encrypted
        ? '🔒 Tes clés sont chiffrées sur ton ordinateur (coffre de Windows) et ne quittent jamais ton PC, sauf vers la source concernée.'
        : '⚠ Chiffrement indisponible sur ce système : les clés sont stockées en clair dans le dossier de l\'appli.'),
    ],
    actions: [
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, onClick: () => save(true) },
    ],
  });
}
