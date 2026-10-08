// La bibliothèque : un dossier sur ton disque qui contient tes sons + un fichier index JSON.
//
//   <dossier bibliothèque>/
//     Sons/Bruitage/…, Sons/Ambiance/…, Sons/Musique/…   ← tes fichiers audio
//     sonotheque-bibliotheque.json                          ← mots-clés, sources, licences…
//     .sauvegardes/                                         ← copies quotidiennes de l'index (7 jours)
//
// Les chemins sont enregistrés relativement au dossier : tu peux déplacer / copier la
// bibliothèque entière (disque externe, autre PC) sans rien casser.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MEDIA_KINDS } from '../shared/media-kinds.mjs';

export const INDEX_FILE = 'sonotheque-bibliotheque.json';
const BACKUP_DIR = '.sauvegardes';
const BACKUPS_KEPT = 7;
const FORMAT_VERSION = 1;

/** Nom de fichier sûr pour Windows (caractères interdits, noms réservés, longueur). */
export function safeFileName(name, fallback = 'son') {
  let s = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  if (!s) s = fallback;
  return s.slice(0, 120);
}

/** Chemin libre : ajoute « (2) », « (3) »… si le fichier existe déjà. */
export function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}.${ext}`);
  for (let i = 2; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, `${base} (${i}).${ext}`);
  }
  return candidate;
}

export function createLibrary(root) {
  const indexPath = path.join(root, INDEX_FILE);
  /** @type {Map<string, object>} */
  const items = new Map();
  let saveTimer = null;
  const listeners = new Set();

  fs.mkdirSync(root, { recursive: true });
  load();
  backupIfNeeded();

  function load() {
    items.clear();
    if (!fs.existsSync(indexPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      for (const it of data.items ?? []) items.set(it.id, it);
    } catch (err) {
      // Index abîmé : on le met de côté plutôt que de l'écraser, et on repart de la dernière sauvegarde.
      const broken = `${indexPath}.abime-${Date.now()}`;
      fs.copyFileSync(indexPath, broken);
      const last = latestBackup();
      if (last) {
        const data = JSON.parse(fs.readFileSync(last, 'utf8'));
        for (const it of data.items ?? []) items.set(it.id, it);
      }
      console.error(`Index illisible, copie dans ${broken}`, err.message);
    }
  }

  function backupDir() {
    return path.join(root, BACKUP_DIR);
  }

  function latestBackup() {
    try {
      const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort();
      return files.length ? path.join(backupDir(), files.at(-1)) : null;
    } catch {
      return null;
    }
  }

  function backupIfNeeded() {
    if (!fs.existsSync(indexPath)) return;
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(backupDir(), `bibliotheque-${today}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    fs.copyFileSync(indexPath, target);
    const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - BACKUPS_KEPT))) {
      fs.rmSync(path.join(backupDir(), old), { force: true });
    }
  }

  function writeNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const data = { version: FORMAT_VERSION, updatedAt: new Date().toISOString(), items: [...items.values()] };
    const tmp = `${indexPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, indexPath);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
  }

  function changed(kind, ids) {
    scheduleSave();
    for (const fn of listeners) fn({ kind, ids });
  }

  return {
    root,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush() {
      if (saveTimer) writeNow();
    },
    list() {
      return [...items.values()];
    },
    get(id) {
      return items.get(id) ?? null;
    },
    absPath(item) {
      if (!item) return null;
      return path.isAbsolute(item.file) ? item.file : path.join(root, item.file);
    },
    /** Dossier de rangement d'un nouveau fichier selon sa catégorie. */
    folderFor(kind, category) {
      const label = MEDIA_KINDS[kind]?.categories?.[category]?.label ?? 'Autre';
      const dir = path.join(root, kind === 'audio' ? 'Sons' : 'Visuels', label);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
    /** Chemin à enregistrer : relatif s'il est dans la bibliothèque, absolu sinon. */
    storedPath(absFile) {
      const rel = path.relative(root, absFile);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : absFile;
    },
    findByHash(hash) {
      if (!hash) return null;
      for (const it of items.values()) if (it.hash === hash) return it;
      return null;
    },
    findBySource(key, pageUrl) {
      for (const it of items.values()) {
        if (key && it.source?.key === key) return it;
        if (pageUrl && it.source?.pageUrl === pageUrl) return it;
      }
      return null;
    },
    add(fields) {
      const item = {
        id: randomUUID(),
        kind: 'audio',
        category: 'sfx',
        keywords: [],
        tags: [],
        favorite: false,
        peaks: null,
        playCount: 0,
        addedAt: new Date().toISOString(),
        ...fields,
      };
      items.set(item.id, item);
      changed('add', [item.id]);
      return item;
    },
    update(id, patch) {
      const it = items.get(id);
      if (!it) return null;
      // Champs modifiables depuis l'interface uniquement.
      const allowed = ['name', 'keywords', 'tags', 'category', 'favorite', 'peaks', 'playCount', 'notes', 'file'];
      for (const k of allowed) if (k in patch) it[k] = patch[k];
      changed('update', [id]);
      return it;
    },
    /** Retire de l'index ; renvoie les éléments retirés (le main se charge des fichiers). */
    remove(ids) {
      const removed = [];
      for (const id of ids) {
        const it = items.get(id);
        if (it) {
          items.delete(id);
          removed.push(it);
        }
      }
      if (removed.length) changed('remove', removed.map((r) => r.id));
      return removed;
    },
  };
}
