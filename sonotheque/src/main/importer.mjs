// Import de fichiers depuis l'ordinateur : analyse (suggestions de mots-clés), puis ajout.

import fs from 'node:fs';
import path from 'node:path';
import { kindForExtension } from '../shared/media-kinds.mjs';
import { guessCategory } from '../shared/media-kinds.mjs';
import { suggestFromPath, usefulWords, cleanKeywords, extraTags } from '../shared/keywords.mjs';
import { describeLicense } from '../shared/licenses.mjs';
import { readAudioInfo, quickHash } from './media-info.mjs';
import { safeFileName, uniquePath } from './library.mjs';

const MAX_FILES_PER_IMPORT = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024; // 2 Go par fichier

// Résultats d'analyse gardés côté principal : l'interface ne renvoie que chemin, nom, mots-clés, catégorie.
const analysisCache = new Map();

function extOf(p) {
  return path.extname(p).slice(1).toLowerCase();
}

/** Liste les fichiers médias reconnus (dossiers parcourus récursivement). */
export async function collectFiles(paths) {
  const out = [];
  async function visit(p, depth) {
    if (out.length >= MAX_FILES_PER_IMPORT || depth > 12) return;
    let st;
    try {
      st = await fs.promises.stat(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      const entries = await fs.promises.readdir(p);
      for (const e of entries.sort()) {
        if (e.startsWith('.')) continue;
        await visit(path.join(p, e), depth + 1);
      }
    } else if (st.isFile() && kindForExtension(extOf(p))) {
      out.push(p);
    }
  }
  for (const p of paths) await visit(p, 0);
  return out;
}

/**
 * Analyse les fichiers avant import : durée, suggestions de mots-clés et de catégorie,
 * doublons déjà présents dans la bibliothèque.
 */
export async function analyzeFiles(paths, library) {
  const files = await collectFiles(paths);
  const results = [];
  for (const file of files) {
    const ext = extOf(file);
    const entry = {
      path: file,
      name: path.basename(file, path.extname(file)),
      ext,
      kind: kindForExtension(ext),
      size: 0,
      duration: null,
      keywords: [],
      category: 'sfx',
      duplicateOf: null,
      error: null,
    };
    try {
      const st = await fs.promises.stat(file);
      entry.size = st.size;
      if (st.size > MAX_IMPORT_BYTES) throw new Error('Fichier trop gros (plus de 2 Go).');
      const info = await readAudioInfo(file);
      entry.duration = info.duration;
      const embeddedWords = [
        ...usefulWords(info.embedded.title ?? ''),
        ...info.embedded.genre.flatMap(usefulWords),
      ];
      entry.keywords = cleanKeywords([...suggestFromPath(file), ...embeddedWords]);
      const allWords = [...usefulWords(file), ...embeddedWords];
      entry.category = guessCategory(allWords, info.duration);
      const hash = await quickHash(file);
      analysisCache.set(file, { info, hash });
      const dup = library.findByHash(hash);
      if (dup) entry.duplicateOf = { id: dup.id, name: dup.name };
    } catch (err) {
      entry.error = err.message?.includes('2 Go') ? err.message : "Fichier illisible ou format non pris en charge.";
    }
    results.push(entry);
  }
  return results;
}

/**
 * Ajoute les fichiers validés par l'utilisateur.
 * @param entries [{ path, name, keywords, category }]
 * @param opts { copy: boolean }
 */
export async function importEntries(entries, library, { copy = true } = {}) {
  const added = [];
  const errors = [];
  const skipped = [];
  for (const e of entries) {
    try {
      const ext = extOf(e.path);
      const kind = kindForExtension(ext);
      if (!kind) throw new Error('Type de fichier non pris en charge.');
      const cached = analysisCache.get(e.path);
      analysisCache.delete(e.path);
      const info = cached?.info ?? (await readAudioInfo(e.path));
      const hash = cached?.hash ?? (await quickHash(e.path));
      if (library.findByHash(hash)) {
        skipped.push(e.path); // déjà dans la bibliothèque
        continue;
      }

      let dest = e.path;
      if (copy) {
        const dir = library.folderFor(kind, e.category);
        dest = uniquePath(dir, safeFileName(e.name || path.basename(e.path, path.extname(e.path))), ext);
        await fs.promises.copyFile(e.path, dest);
      }
      const keywords = cleanKeywords(e.keywords);
      const st = await fs.promises.stat(dest);
      const item = library.add({
        kind,
        category: e.category || 'sfx',
        name: e.name || path.basename(e.path, path.extname(e.path)),
        file: library.storedPath(dest),
        ext,
        size: st.size,
        duration: info.duration,
        sampleRate: info.sampleRate,
        channels: info.channels,
        keywords,
        tags: extraTags([...usefulWords(path.basename(e.path)), ...info.embedded.genre], keywords),
        hash,
        source: {
          provider: 'local',
          providerLabel: 'Import local',
          key: null,
          originalPath: e.path,
          author: info.embedded.artist,
          license: describeLicense('own'),
        },
      });
      added.push(item);
    } catch (err) {
      errors.push({ path: e.path, error: err.message });
    }
  }
  return { added, errors, skipped };
}
