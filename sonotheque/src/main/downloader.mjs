// Téléchargement d'un son en ligne vers la bibliothèque, avec progression et vérifications :
// HTTPS uniquement, taille maximum, et contrôle que le fichier reçu est bien un audio lisible.

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { getFetch, USER_AGENT } from './http.mjs';
import { readAudioInfo, quickHash } from './media-info.mjs';
import { safeFileName, uniquePath } from './library.mjs';
import { cleanKeywords, extraTags, usefulWords } from '../shared/keywords.mjs';
import { kindForExtension } from '../shared/media-kinds.mjs';

export const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024; // 1 Go
const IDLE_TIMEOUT_MS = 60_000;

const EXT_BY_TYPE = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/ogg': 'ogg', 'application/ogg': 'ogg',
  'audio/aiff': 'aif', 'audio/x-aiff': 'aif', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
  'audio/opus': 'opus',
};

/** Télécharge `url` dans `destNoExt` (+ extension), en appelant onProgress(reçu, total). */
export async function fetchToFile(url, destDir, baseName, { headers = {}, ext = 'mp3', onProgress, signal } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Téléchargement refusé : adresse non sécurisée (HTTPS requis).');

  // Une source qui ne répond plus ne doit pas laisser le téléchargement bloqué pour toujours :
  // sans aucune donnée pendant IDLE_TIMEOUT_MS, on abandonne.
  const ctrl = new AbortController();
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  let idle;
  const alive = () => {
    clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT_MS);
  };
  let part = null;
  try {
    alive();
    const res = await getFetch()(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: ctrl.signal, redirect: 'follow' });
    // Après d'éventuelles redirections, l'adresse finale doit toujours être en HTTPS.
    if (res.url && new URL(res.url).protocol !== 'https:') {
      throw new Error('Téléchargement refusé : la source redirige vers une adresse non sécurisée.');
    }
    if (!res.ok) {
      if (res.status === 401) throw new Error('Connexion à la source expirée : reconnecte ton compte dans les Réglages.');
      throw new Error(`La source a refusé le téléchargement (erreur ${res.status}).`);
    }
    const total = Number(res.headers.get('content-length')) || 0;
    if (total > MAX_DOWNLOAD_BYTES) throw new Error('Fichier trop gros (plus de 1 Go).');

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (/^(text\/html|application\/json)/.test(type)) throw new Error("La source a renvoyé une page web au lieu d'un fichier audio.");
    let finalExt = String(ext || EXT_BY_TYPE[type] || 'mp3').toLowerCase();
    if (!kindForExtension(finalExt)) finalExt = EXT_BY_TYPE[type] ?? 'mp3';

    fs.mkdirSync(destDir, { recursive: true });
    const dest = uniquePath(destDir, baseName, finalExt);
    part = `${dest}.part`;
    let received = 0;
    // pipeline() gère aussi les erreurs d'écriture (disque plein…), qui sinon bloqueraient tout.
    await pipeline(res.body, async function* count(source) {
      for await (const chunk of source) {
        alive();
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) throw new Error('Fichier trop gros (plus de 1 Go).');
        onProgress?.(received, total);
        yield chunk;
      }
    }, fs.createWriteStream(part));
    fs.renameSync(part, dest);
    return dest;
  } catch (err) {
    if (part) fs.rmSync(part, { force: true });
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error('La source ne répond plus : téléchargement abandonné.');
    throw err;
  } finally {
    clearTimeout(idle);
  }
}

/**
 * Télécharge un résultat en ligne et l'ajoute à la bibliothèque.
 * @param result   résultat normalisé (voir sources/common.mjs)
 * @param plan     { url, headers, ext, quality } renvoyé par source.download()
 * @param choice   { keywords, category, name } choisis par l'utilisateur
 */
export async function downloadToLibrary(result, plan, choice, library, { onProgress, signal } = {}) {
  const dir = library.folderFor(result.kind, choice.category);
  const base = safeFileName(choice.name || result.title);
  const dest = await fetchToFile(plan.url, dir, base, { headers: plan.headers, ext: plan.ext, onProgress, signal });

  let info;
  try {
    info = await readAudioInfo(dest);
  } catch {
    fs.rmSync(dest, { force: true });
    throw new Error("Le fichier reçu n'est pas un audio valide : téléchargement annulé.");
  }
  const hash = await quickHash(dest);
  const keywords = cleanKeywords(choice.keywords);
  const st = fs.statSync(dest);
  const ext = path.extname(dest).slice(1).toLowerCase();

  return library.add({
    kind: result.kind,
    category: choice.category,
    name: choice.name || result.title,
    file: library.storedPath(dest),
    ext,
    size: st.size,
    duration: info.duration ?? result.duration,
    sampleRate: info.sampleRate,
    channels: info.channels,
    keywords,
    tags: extraTags([...result.tags, ...usefulWords(result.title)], keywords),
    hash,
    source: {
      provider: result.provider,
      providerLabel: result.providerLabel,
      via: result.via,
      id: result.id,
      key: result.key,
      title: result.title,
      pageUrl: result.pageUrl,
      author: result.author,
      authorUrl: result.authorUrl,
      license: result.license,
      quality: plan.quality ?? result.quality,
      downloadedFrom: new URL(plan.url).hostname,
      downloadedAt: new Date().toISOString(),
    },
  });
}
