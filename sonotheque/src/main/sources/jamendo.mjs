// Jamendo (jamendo.com) : musiques complètes d'artistes indépendants sous Creative Commons.
// Clé gratuite (« Client ID ») à créer sur https://devportal.jamendo.com.
// Attention : beaucoup de titres sont en licence NC (non commerciale) ; pour un usage commercial,
// Jamendo propose une licence payante séparée (Jamendo Licensing).
// Doc : https://developer.jamendo.com/v3.0/tracks

import { getJson, buildUrl, HttpError } from '../http.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE } from './common.mjs';

export const jamendo = {
  id: 'jamendo',
  label: 'Jamendo',
  kinds: ['audio'],
  homepage: 'https://www.jamendo.com',
  description: 'Musiques complètes sous Creative Commons. Clé (Client ID) gratuite.',
  needsKey: true,
  keyHelp: 'https://devportal.jamendo.com',
  musicSource: true,

  isConfigured(settings) {
    return Boolean(settings.jamendo?.clientId);
  },

  async search({ query, page = 1, settings }) {
    const url = buildUrl('https://api.jamendo.com/v3.0/tracks/', {
      client_id: settings.jamendo.clientId,
      format: 'json',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: query,
      include: 'musicinfo licenses',
      audioformat: 'mp32',
      audiodlformat: 'mp32',
      fullcount: 'true',
    });
    const data = await getJson(url);
    if (data.headers?.status === 'failed') {
      const msg = /client id/i.test(data.headers.error_message ?? '')
        ? 'Client ID Jamendo refusé : vérifie-le dans les Réglages.'
        : `Jamendo : ${data.headers.error_message}`;
      throw new HttpError(401, msg);
    }
    const items = (data.results ?? []).map(parseJamendo);
    const total = data.headers?.results_fullcount ?? items.length;
    return { items, total, hasMore: page * PAGE_SIZE < total };
  },

  async download(result) {
    if (!result.raw.downloadAllowed || !result.raw.download) {
      throw new HttpError(403, "L'artiste n'autorise pas le téléchargement de ce titre.");
    }
    return { url: result.raw.download, ext: 'mp3', headers: {}, quality: 'MP3 VBR' };
  },
};

export function parseJamendo(r) {
  const info = r.musicinfo?.tags ?? {};
  const tags = [...(info.genres ?? []), ...(info.vartags ?? []), ...(info.instruments ?? [])];
  return makeResult({
    provider: 'jamendo',
    providerLabel: 'Jamendo',
    id: String(r.id),
    title: r.name,
    author: r.artist_name || null,
    authorUrl: r.artist_id ? `https://www.jamendo.com/artist/${r.artist_id}` : null,
    pageUrl: r.shareurl || `https://www.jamendo.com/track/${r.id}`,
    previewUrl: r.audio || null,
    duration: r.duration ?? null,
    tags,
    license: describeLicense(r.license_ccurl),
    filetype: 'mp3',
    quality: 'MP3 VBR',
    note: [r.album_name ? `Album : ${r.album_name}` : null,
      r.audiodownload_allowed === false ? "L'artiste n'autorise pas le téléchargement : écoute seulement." : null]
      .filter(Boolean).join(' — ') || null,
    downloadable: r.audiodownload_allowed !== false && Boolean(r.audiodownload),
    raw: { stream: r.audio, download: r.audiodownload, downloadAllowed: r.audiodownload_allowed !== false },
  });
}
