// Mots-clés : nettoyage et suggestions automatiques (1 à 3 mots).

import { normalize, tokenize, isNoiseToken } from './text.mjs';

export const MAX_KEYWORDS = 3;

/** Sépare « DoorSlamHeavy_01 » en « Door Slam Heavy 01 ». */
function splitCamel(str) {
  return String(str).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2');
}

/** Mots utiles d'un texte (sans bruit technique ni mots vides). */
export function usefulWords(str) {
  return tokenize(splitCamel(str)).filter((t) => !isNoiseToken(t));
}

/**
 * Nettoie une liste de mots-clés saisie par l'utilisateur : minuscules, espaces simplifiés,
 * doublons retirés (en ignorant les accents), limitée à `max`.
 * Les accents sont conservés pour l'affichage (« forêt »), la recherche les ignore.
 */
export function cleanKeywords(list, max = MAX_KEYWORDS) {
  const seen = new Set();
  const out = [];
  for (const raw of list ?? []) {
    const kw = String(raw).toLowerCase().replace(/[,;#]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!kw) continue;
    const key = normalize(kw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= max) break;
  }
  return out;
}

/** Découpe une saisie « pluie, forte orage » en mots-clés. Virgule = séparateur ; sinon espaces. */
export function parseKeywordInput(text) {
  const s = String(text ?? '');
  const parts = s.includes(',') ? s.split(',') : s.split(/\s+/);
  return cleanKeywords(parts, Infinity);
}

/**
 * Suggestions pour un fichier local : mots du nom de fichier, puis du dossier parent.
 * `filePath` peut être un chemin Windows ou POSIX.
 */
export function suggestFromPath(filePath, max = MAX_KEYWORDS) {
  const parts = String(filePath).split(/[\\/]/).filter(Boolean);
  const file = (parts.pop() ?? '').replace(/\.[a-z0-9]{1,5}$/i, '');
  const parent = parts.pop() ?? '';
  const words = [...usefulWords(file), ...usefulWords(parent)];
  return cleanKeywords(words, max);
}

/**
 * Suggestions pour un son trouvé en ligne : d'abord les mots de ta recherche (dans ta langue),
 * puis les tags les plus parlants de la source.
 */
export function suggestFromOnline(query, tags = [], title = '', max = MAX_KEYWORDS) {
  const fromQuery = usefulWords(query);
  const fromTags = (tags ?? []).flatMap((t) => usefulWords(t));
  const fromTitle = usefulWords(title);
  return cleanKeywords([...fromQuery, ...fromTags, ...fromTitle], max);
}

/** Tags supplémentaires (cherchables mais non affichés en avant), sans doublon avec les mots-clés. */
export function extraTags(tags, keywords, max = 25) {
  const kw = new Set((keywords ?? []).map(normalize));
  const out = [];
  const seen = new Set();
  for (const t of tags ?? []) {
    const n = normalize(t);
    if (!n || n.length < 2 || kw.has(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}
