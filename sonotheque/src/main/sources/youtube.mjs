// YouTube : recherche de vidéos dont on récupère seulement la piste audio, convertie en WAV.
// Sans compte ni clé : tout passe par l'outil yt-dlp (voir ../ytdlp.mjs).
// Attention : télécharger depuis YouTube est contraire à ses conditions d'utilisation, et la
// plupart des vidéos sont protégées par le droit d'auteur. Les résultats sont donc classés
// « licence inconnue », sauf les vidéos que leur auteur a publiées en Creative Commons (CC BY).
// Avec le filtre « Usage commercial », on ne cherche que parmi ces vidéos-là.

import fs from 'node:fs';
import path from 'node:path';
import { ytdlp } from '../ytdlp.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE } from './common.mjs';

export const MAX_SECONDS = 10 * 60; // au-delà, ce n'est plus un son à ranger mais une vidéo entière
const MAX_PAGES = 3;
const AUDIO = 'bestaudio[ext=m4a]/bestaudio';
const CC_FILTER = 'EgIwAQ%3D%3D'; // filtre « Creative Commons » de la recherche YouTube
const CC_BY = () => describeLicense('by', { version: '3.0', url: 'https://creativecommons.org/licenses/by/3.0/' });
const NOTE = 'Vidéo YouTube : seule la piste audio est récupérée, puis convertie en WAV.';

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export const youtube = {
  id: 'youtube',
  label: 'YouTube',
  kinds: ['audio'],
  homepage: 'https://www.youtube.com',
  description: `Piste audio des vidéos de moins de ${MAX_SECONDS / 60} minutes, convertie en WAV. Droits à vérifier toi-même : la plupart des vidéos sont protégées.`,
  needsKey: false,

  isConfigured() {
    return true;
  },

  async search({ query, page = 1, commercialOnly = false }) {
    if (page > MAX_PAGES) return { items: [], total: 0, hasMore: false };
    const wanted = page * PAGE_SIZE;
    const target = commercialOnly
      ? ['--playlist-end', String(wanted), `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${CC_FILTER}`]
      : [`ytsearch${wanted}:${query}`];
    const data = JSON.parse(await ytdlp(['--flat-playlist', '-J', ...target]));
    const entries = (data.entries ?? []).slice(wanted - PAGE_SIZE);
    const items = entries.map((e) => parseYoutube(e, commercialOnly)).filter(Boolean);
    return { items, total: items.length, hasMore: entries.length === PAGE_SIZE && page < MAX_PAGES };
  },

  /** Appelé à l'écoute ou à l'ajout : adresse de la piste audio et licence déclarée par l'auteur. */
  async resolve(result) {
    const info = JSON.parse(await ytdlp(['-J', '-f', AUDIO, '--', watchUrl(result.id)]));
    const url = info.url ?? info.requested_downloads?.[0]?.url ?? null;
    return {
      ...result,
      needsResolve: false,
      previewUrl: typeof url === 'string' && url.startsWith('https://') ? url : null,
      duration: info.duration ?? result.duration,
      tags: (info.tags ?? []).slice(0, 12).map(String),
      license: /creative commons/i.test(info.license ?? '') ? CC_BY() : result.license,
    };
  },

  async download(result) {
    return {
      url: result.pageUrl,
      ext: 'wav',
      quality: 'Piste audio YouTube convertie en WAV',
      convert: true, // le fichier reçu (m4a) est décodé puis réécrit en WAV par l'interface
      /** Télécharge la piste audio dans `dir` et renvoie le chemin du fichier. */
      async save(dir, { onProgress } = {}) {
        fs.mkdirSync(dir, { recursive: true });
        await ytdlp(['-f', AUDIO, '--no-part', '--max-filesize', '80m', '-o', path.join(dir, `${result.id}.%(ext)s`),
          '--newline', '--progress-template', 'download:%(progress.downloaded_bytes)s/%(progress.total_bytes,progress.total_bytes_estimate)s',
          '--', watchUrl(result.id)], {
          timeoutMs: 5 * 60_000,
          onLine: (l) => { const m = l.match(/^(\d+)\/(\d+)/); if (m) onProgress?.(Number(m[1]), Number(m[2])); },
        });
        const file = fs.readdirSync(dir).find((f) => f.startsWith(`${result.id}.`));
        if (!file) throw new Error('YouTube n’a pas fourni la piste audio de cette vidéo.');
        return path.join(dir, file);
      },
    };
  },
};

export function parseYoutube(e, creativeCommons = false) {
  const id = String(e?.id ?? '');
  if (!/^[\w-]{11}$/.test(id) || !e.duration || e.duration > MAX_SECONDS) return null; // ni directs, ni vidéos longues
  return makeResult({
    provider: 'youtube',
    providerLabel: 'YouTube',
    id,
    title: e.title,
    author: e.channel ?? e.uploader ?? null,
    authorUrl: e.channel_url ?? null,
    pageUrl: watchUrl(id),
    duration: e.duration,
    license: creativeCommons ? CC_BY() : describeLicense('unknown', { url: watchUrl(id) }),
    filetype: 'wav',
    quality: 'Piste audio convertie en WAV',
    note: creativeCommons ? `${NOTE} Licence Creative Commons déclarée par l'auteur de la vidéo.`
      : `${NOTE} Vérifie les droits avant de l'utiliser dans une vidéo publiée.`,
    needsResolve: true,
    raw: {},
  });
}
