// BBC Sound Effects (sound-effects.bbcrewind.co.uk) : 33 000 bruitages et ambiances des archives
// de la BBC, dont beaucoup d'enregistrements de nature. Sans compte.
// Attention : licence « RemArc » de la BBC, réservée à un usage personnel, éducatif ou de
// recherche. Interdit en vidéo monétisée ou pour un client (la BBC vend une licence commerciale
// à part). Tous ces sons sont donc classés « non commercial ».
// L'interface de recherche utilisée est celle du site de la BBC ; elle n'est pas documentée.

import { getJson } from '../http.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE } from './common.mjs';

const MEDIA = 'https://sound-effects-media.bbcrewind.co.uk';
const LICENSE_URL = 'https://sound-effects.bbcrewind.co.uk/licensing';
const MAX_WAV_BYTES = 150 * 1024 * 1024; // au-delà, on télécharge le MP3

export const bbc = {
  id: 'bbc',
  label: 'BBC Sound Effects',
  kinds: ['audio'],
  homepage: 'https://sound-effects.bbcrewind.co.uk',
  description: 'Archives sonores de la BBC : nature, ambiances, bruitages. Usage non commercial uniquement.',
  needsKey: false,

  isConfigured() {
    return true;
  },

  async search({ query, page = 1, commercialOnly = false }) {
    // Aucun de ces sons n'est utilisable commercialement : inutile d'interroger la BBC.
    if (commercialOnly) return { items: [], total: 0, hasMore: false };
    const from = (page - 1) * PAGE_SIZE;
    const data = await getJson('https://sound-effects-api.bbcrewind.co.uk/api/sfx/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: { from, size: PAGE_SIZE, query } }),
    });
    const items = (data.results ?? []).map(parseBbc);
    const total = Number(data.total) || items.length;
    return { items, total, hasMore: from + items.length < total };
  },

  async download(result) {
    const { id, wavBytes } = result.raw;
    return wavBytes && wavBytes <= MAX_WAV_BYTES
      ? { url: `${MEDIA}/wav/${id}.wav`, ext: 'wav', headers: {}, quality: 'Original WAV' }
      : { url: `${MEDIA}/mp3/${id}.mp3`, ext: 'mp3', headers: {}, quality: 'MP3 128 kbps' };
  },
};

export function parseBbc(r) {
  const id = encodeURIComponent(String(r.id));
  const description = String(r.description ?? '').trim();
  const extra = r.additionalMetadata ?? {};
  // Pas de titre côté BBC : on prend le début de la description.
  const title = description.length > 70 ? `${description.slice(0, 67).trimEnd()}…` : description;
  const wavBytes = Number(r.fileSizes?.wavFileSize) || null;
  return makeResult({
    provider: 'bbc',
    providerLabel: 'BBC Sound Effects',
    id,
    title: title || extra.cdName || `BBC ${r.id}`,
    author: extra.recordist || 'BBC',
    pageUrl: `https://sound-effects.bbcrewind.co.uk/search?q=${id}`,
    previewUrl: `${MEDIA}/mp3/${id}.mp3`,
    duration: r.duration ? r.duration / 1000 : null,
    tags: (r.tags ?? []).map(String),
    license: describeLicense('bbc-remarc', { url: LICENSE_URL }),
    filetype: 'wav',
    filesize: wavBytes,
    quality: 'Original WAV',
    note: [description.length > 70 ? description : null, extra.locationText ? `Lieu : ${extra.locationText}` : null,
      'Licence BBC RemArc : usage personnel, éducatif ou de recherche uniquement.'].filter(Boolean).join(' — '),
    raw: { id, wavBytes },
  });
}
