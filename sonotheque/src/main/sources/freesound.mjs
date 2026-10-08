// Freesound (freesound.org) : la plus grosse banque collaborative de bruitages et d'ambiances.
// - Recherche et écoute : clé API gratuite (Réglages).
// - Téléchargement :
//     • sans connexion → aperçu MP3 haute qualité (~128 kbps), suffisant pour beaucoup de montages ;
//     • avec « Connecter mon compte Freesound » → fichier original (souvent WAV/FLAC).
// Doc : https://freesound.org/docs/api/

import { getJson, buildUrl } from '../http.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE, stripHtml } from './common.mjs';

const FIELDS = 'id,name,tags,description,license,username,url,previews,duration,type,filesize,samplerate,channels';

export const freesound = {
  id: 'freesound',
  label: 'Freesound',
  kinds: ['audio'],
  homepage: 'https://freesound.org',
  description: 'Plus de 600 000 bruitages et ambiances. Clé API gratuite.',
  needsKey: true,
  keyHelp: 'https://freesound.org/apiv2/apply',

  isConfigured(settings) {
    return Boolean(settings.freesound?.apiKey);
  },

  async search({ query, page = 1, settings }) {
    const url = buildUrl('https://freesound.org/apiv2/search/text/', {
      query,
      page,
      page_size: PAGE_SIZE,
      fields: FIELDS,
      token: settings.freesound.apiKey,
    });
    const data = await getJson(url);
    const connected = Boolean(settings.freesound?.oauth?.refreshToken);
    const items = (data.results ?? []).map((r) => parseFreesound(r, connected));
    return { items, total: data.count ?? items.length, hasMore: Boolean(data.next) };
  },

  /** @param ctx { getAccessToken(): Promise<string|null> } */
  async download(result, ctx) {
    const token = await ctx.getAccessToken?.();
    if (token) {
      return {
        url: `https://freesound.org/apiv2/sounds/${result.id}/download/`,
        headers: { Authorization: `Bearer ${token}` },
        ext: result.raw.type || 'wav',
        quality: `Original ${String(result.raw.type || '').toUpperCase()}`.trim(),
      };
    }
    return { url: result.raw.hqPreview, headers: {}, ext: 'mp3', quality: 'Aperçu MP3 HQ' };
  },
};

export function parseFreesound(r, connected = false) {
  const previews = r.previews ?? {};
  const hq = previews['preview-hq-mp3'] || previews['preview-lq-mp3'] || null;
  const tech = [
    r.type ? String(r.type).toUpperCase() : null,
    r.samplerate ? `${Math.round(r.samplerate / 100) / 10} kHz` : null,
    r.channels === 1 ? 'mono' : r.channels === 2 ? 'stéréo' : null,
  ].filter(Boolean).join(' · ');
  return makeResult({
    provider: 'freesound',
    providerLabel: 'Freesound',
    id: String(r.id),
    title: r.name,
    author: r.username || null,
    authorUrl: r.username ? `https://freesound.org/people/${encodeURIComponent(r.username)}/` : null,
    pageUrl: r.url || `https://freesound.org/s/${r.id}/`,
    previewUrl: hq,
    duration: r.duration ?? null,
    tags: r.tags ?? [],
    license: describeLicense(r.license, { url: /^https?:/.test(r.license ?? '') ? r.license : null }),
    filetype: r.type || null,
    filesize: r.filesize || null,
    quality: connected ? `Original ${tech}` : 'Aperçu MP3 HQ (connecte ton compte pour l\'original)',
    note: stripHtml(r.description).slice(0, 280) || null,
    raw: { hqPreview: hq, type: r.type || null, tech },
  });
}
