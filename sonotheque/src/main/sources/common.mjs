// Format commun des résultats en ligne, quelle que soit la source.

import { describeLicense } from '../../shared/licenses.mjs';

export const PAGE_SIZE = 20;

/**
 * @typedef {object} OnlineResult
 * @property {string} key          identifiant unique « source:id »
 * @property {string} provider     id de la source (freesound, openverse…)
 * @property {string} providerLabel nom affiché de la source
 * @property {string|null} via     plateforme d'origine quand la source est un agrégateur (Openverse)
 * @property {string} kind         type de média (« audio »)
 * @property {string} id
 * @property {string} title
 * @property {string|null} author
 * @property {string|null} authorUrl
 * @property {string|null} pageUrl     page d'origine du son (à ouvrir pour vérifier)
 * @property {string|null} previewUrl  URL d'écoute (null = à résoudre au moment de l'écoute)
 * @property {number|null} duration    en secondes
 * @property {string[]} tags
 * @property {object} license          voir describeLicense()
 * @property {string|null} filetype
 * @property {number|null} filesize    octets
 * @property {string|null} quality     précision sur la qualité téléchargée
 * @property {string|null} note        remarque à afficher au survol
 * @property {boolean} downloadable     faux si la source interdit le téléchargement
 * @property {boolean} needsResolve    vrai si previewUrl / téléchargement demandent un appel en plus
 * @property {object} raw              données propres à la source, utiles pour le téléchargement
 */

export function makeResult(fields) {
  const license = fields.license?.code ? fields.license : describeLicense(fields.license ?? null);
  return {
    kind: 'audio',
    via: null,
    author: null,
    authorUrl: null,
    pageUrl: null,
    previewUrl: null,
    duration: null,
    tags: [],
    filetype: null,
    filesize: null,
    quality: null,
    note: null,
    needsResolve: false,
    downloadable: true,
    raw: {},
    ...fields,
    key: `${fields.provider}:${fields.id}`,
    title: String(fields.title ?? 'Sans titre').trim() || 'Sans titre',
    license,
  };
}

/** Nettoie un texte HTML court (descriptions) en texte brut. */
export function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

/** Extension de fichier à partir d'une URL ou d'un type. */
export function extFrom(urlOrType, fallback = 'mp3') {
  const s = String(urlOrType ?? '').toLowerCase();
  const m = s.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/);
  if (m) return m[1];
  if (/^[a-z0-9]{2,5}$/.test(s)) return s;
  return fallback;
}
