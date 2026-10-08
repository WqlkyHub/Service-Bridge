// Openverse (openverse.org) : moteur de la fondation WordPress qui agrège des millions de sons
// sous licence Creative Commons (Freesound, Jamendo, Wikimedia Commons, ccMixter…).
// Aucune clé nécessaire. Doc : https://api.openverse.org/v1/

import { getJson, buildUrl } from '../http.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE, extFrom } from './common.mjs';

const PROVIDER_LABELS = {
  freesound: 'Freesound',
  jamendo: 'Jamendo',
  wikimedia_audio: 'Wikimedia Commons',
  ccmixter: 'ccMixter',
  europeana: 'Europeana',
};

export const openverse = {
  id: 'openverse',
  label: 'Openverse',
  kinds: ['audio'],
  homepage: 'https://openverse.org',
  description: 'Agrégateur de sons Creative Commons (Freesound, Jamendo, Wikimedia…). Sans compte.',
  needsKey: false,

  isConfigured() {
    return true;
  },

  async search({ query, page = 1, commercialOnly = false }) {
    const url = buildUrl('https://api.openverse.org/v1/audio/', {
      q: query,
      page,
      page_size: PAGE_SIZE,
      license_type: commercialOnly ? 'commercial' : null,
    });
    const data = await getJson(url);
    const items = (data.results ?? []).map(parseOpenverse);
    return { items, total: data.result_count ?? items.length, hasMore: page < (data.page_count ?? 1) };
  },

  async download(result) {
    return { url: result.raw.fileUrl, ext: extFrom(result.raw.filetype || result.raw.fileUrl), headers: {} };
  },
};

export function parseOpenverse(r) {
  const via = r.source || r.provider || null;
  const viaLabel = PROVIDER_LABELS[via] ?? via;
  return makeResult({
    provider: 'openverse',
    providerLabel: 'Openverse',
    via: viaLabel,
    id: r.id,
    title: r.title,
    author: r.creator || null,
    authorUrl: r.creator_url || null,
    pageUrl: r.foreign_landing_url || null,
    previewUrl: r.url || null,
    duration: r.duration ? r.duration / 1000 : null,
    tags: (r.tags ?? []).map((t) => t.name).filter(Boolean),
    license: describeLicense(r.license_url || r.license, { url: r.license_url, version: r.license_version }),
    filetype: r.filetype || null,
    filesize: r.filesize || null,
    quality: r.filetype ? `Fichier ${String(r.filetype).toUpperCase()}${r.bit_rate ? ` ${Math.round(r.bit_rate / 1000)} kbps` : ''}` : null,
    note: viaLabel ? `Trouvé via Openverse, fichier hébergé par ${viaLabel}.` : null,
    raw: { fileUrl: r.url, filetype: r.filetype, attribution: r.attribution },
  });
}
