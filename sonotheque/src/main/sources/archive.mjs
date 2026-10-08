// Internet Archive (archive.org) : archives sonores, vieux enregistrements, domaine public.
// Sans compte. Qualité et licences très inégales : la licence est souvent absente (→ « À vérifier »).
// Un « élément » Archive peut contenir plusieurs fichiers ; on prend le premier fichier audio.
// Doc : https://archive.org/developers/

import { getJson, buildUrl } from '../http.mjs';
import { describeLicense } from '../../shared/licenses.mjs';
import { makeResult, PAGE_SIZE, stripHtml, extFrom } from './common.mjs';

const PREVIEW_FORMATS = ['VBR MP3', '128Kbps MP3', '64Kbps MP3', 'MP3', 'Ogg Vorbis'];
const LOSSLESS_FORMATS = ['Flac', 'WAVE', '24bit Flac'];
const MAX_LOSSLESS_BYTES = 300 * 1024 * 1024;
// Collections hors sujet pour du sound design (podcasts, concerts, émissions de radio, livres audio…).
const EXCLUDED_COLLECTIONS = ['podcasts', 'audio_podcast', 'etree', 'radioprograms', 'oldtimeradio',
  'librivoxaudio', 'audio_bookspoetry', 'audio_religion', 'audio_tech', 'audio_news', 'georgeblood',
  'hiphopmixtapes', 'djmixtapes', 'netlabels'];

const SFX_SUBJECTS = ['"sound effects"', '"sound effect"', 'sfx', '"field recording"', 'fieldrecording',
  'ambience', 'ambient', 'soundscape', 'foley', '"sound design"', '"nature sounds"', 'noise', 'atmosphere'];
const strictMode = new Map();

function runQuery(q, page, strict) {
  const parts = [`(title:(${q}) OR subject:(${q}))`, 'mediatype:(audio)', `NOT collection:(${EXCLUDED_COLLECTIONS.join(' OR ')})`];
  if (strict) parts.push(`(subject:(${SFX_SUBJECTS.join(' OR ')}) OR collection:(radio-aporee-maps))`);
  const url = buildUrl('https://archive.org/advancedsearch.php', {
    q: parts.join(' AND '),
    'fl[]': ['identifier', 'title', 'creator', 'licenseurl', 'subject', 'description'],
    rows: PAGE_SIZE,
    page,
    output: 'json',
  });
  return getJson(url);
}

export const archive = {
  id: 'archive',
  label: 'Internet Archive',
  kinds: ['audio'],
  homepage: 'https://archive.org/details/audio',
  description: 'Archives sonores et domaine public. Sans compte, qualité inégale.',
  needsKey: false,

  isConfigured() {
    return true;
  },

  async search({ query, page = 1 }) {
    const q = String(query).replace(/[:()"\\[\]{}^~*?]/g, ' ').trim();
    // D'abord les éléments marqués « effets sonores / field recording / ambiance » ; si presque
    // rien ne sort, on élargit à tout l'audio (en gardant le même mode pour les pages suivantes).
    let strict = strictMode.get(q) ?? true;
    let data = await runQuery(q, page, strict);
    if (page === 1 && strict && (data.response?.numFound ?? 0) < 8) {
      strict = false;
      data = await runQuery(q, page, strict);
    }
    strictMode.set(q, strict);
    const docs = data.response?.docs ?? [];
    const total = data.response?.numFound ?? docs.length;
    return { items: docs.map(parseArchiveDoc), total, hasMore: page * PAGE_SIZE < total };
  },

  /** Va chercher la liste des fichiers de l'élément pour trouver l'audio à écouter / télécharger. */
  async resolve(result) {
    const meta = await getJson(`https://archive.org/metadata/${encodeURIComponent(result.id)}`);
    return applyArchiveMetadata(result, meta);
  },

  async download(result) {
    const r = result.raw.downloadUrl ? result : await this.resolve(result);
    if (!r.raw.downloadUrl) throw new Error('Aucun fichier audio trouvé dans cet élément Archive.');
    return { url: r.raw.downloadUrl, ext: r.raw.downloadExt, headers: {}, quality: r.quality };
  },
};

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseArchiveDoc(d) {
  const subjects = asArray(d.subject).flatMap((s) => String(s).split(/[;,]/)).map((s) => s.trim()).filter(Boolean);
  return makeResult({
    provider: 'archive',
    providerLabel: 'Internet Archive',
    id: d.identifier,
    title: asArray(d.title)[0],
    author: asArray(d.creator)[0] || null,
    pageUrl: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
    tags: subjects.slice(0, 20),
    license: describeLicense(d.licenseurl || null, { url: d.licenseurl || null }),
    note: stripHtml(asArray(d.description)[0]).slice(0, 280) || null,
    needsResolve: true,
    raw: {},
  });
}

function parseLength(len) {
  if (len == null) return null;
  const s = String(len);
  if (s.includes(':')) return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function applyArchiveMetadata(result, meta) {
  const id = result.id;
  const files = meta.files ?? [];
  const audio = files.filter((f) => PREVIEW_FORMATS.includes(f.format) || LOSSLESS_FORMATS.includes(f.format));
  const fileUrl = (f) => `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`;

  const preview = PREVIEW_FORMATS.map((fmt) => files.find((f) => f.format === fmt)).find(Boolean);
  const lossless = LOSSLESS_FORMATS.map((fmt) => files.find((f) => f.format === fmt))
    .find((f) => f && Number(f.size ?? 0) <= MAX_LOSSLESS_BYTES);
  const dl = lossless ?? preview;

  // Distinct « morceaux » (on ne compte pas les doublons d'un même son en plusieurs formats).
  const tracks = new Set(audio.map((f) => f.name.replace(/\.[^.]+$/, ''))).size;
  const license = meta.metadata?.licenseurl
    ? describeLicense(meta.metadata.licenseurl, { url: meta.metadata.licenseurl })
    : result.license;

  const notes = [result.note];
  if (tracks > 1) notes.push(`Cet élément contient ${tracks} fichiers audio : seul le premier est utilisé.`);
  return {
    ...result,
    license,
    previewUrl: preview ? fileUrl(preview) : dl ? fileUrl(dl) : null,
    duration: parseLength((preview ?? dl)?.length) ?? result.duration,
    filetype: dl ? extFrom(dl.name) : null,
    filesize: dl?.size ? Number(dl.size) : null,
    quality: dl ? `${dl.format}${dl === lossless ? ' (sans perte)' : ''}` : null,
    note: notes.filter(Boolean).join(' — ') || null,
    needsResolve: false,
    downloadable: Boolean(dl),
    raw: { ...result.raw, downloadUrl: dl ? fileUrl(dl) : null, downloadExt: dl ? extFrom(dl.name) : 'mp3' },
  };
}
