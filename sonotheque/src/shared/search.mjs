// Recherche dans la bibliothèque locale, pensée pour 1 à 3 mots-clés.
// Chaque mot de la requête doit être trouvé (ET logique), dans n'importe quelle langue
// grâce au dictionnaire FR↔EN, et en début de mot (« plu » trouve « pluie »).

import { normalize, tokenize } from './text.mjs';
import { equivalents } from './synonyms.mjs';

// Poids selon l'endroit où le mot est trouvé.
const WEIGHT = { keyword: 10, tag: 4, name: 3, meta: 1 };

/** Prépare un élément pour la recherche (à mettre en cache : coûteux à refaire à chaque frappe). */
export function indexItem(item) {
  const fields = {
    keyword: (item.keywords ?? []).flatMap(tokenize),
    tag: (item.tags ?? []).flatMap(tokenize),
    name: tokenize(item.name),
    meta: [
      ...tokenize(item.source?.author),
      ...tokenize(item.source?.providerLabel),
      ...tokenize(item.source?.via),
    ],
  };
  return fields;
}

/** Variantes d'un mot de la requête : lui-même + traductions + singulier/pluriel simple. */
export function expandTerm(term) {
  const t = normalize(term);
  const variants = new Set([t, ...equivalents(t)]);
  if (t.endsWith('s') && t.length > 3) {
    const singular = t.slice(0, -1);
    variants.add(singular);
    for (const e of equivalents(singular)) variants.add(e);
  }
  // Les traductions de plusieurs mots (« car horn ») sont découpées.
  return [...variants].flatMap((v) => v.split(' ')).filter(Boolean);
}

function scoreTerm(index, variants) {
  let best = 0;
  for (const [field, words] of Object.entries(index)) {
    for (const w of words) {
      for (const v of variants) {
        let s = 0;
        if (w === v) s = WEIGHT[field] * 2;
        else if (v.length >= 2 && w.startsWith(v)) s = WEIGHT[field];
        if (s > best) best = s;
      }
    }
  }
  return best;
}

/**
 * Filtre et trie les éléments.
 * @param {Array} items   éléments de la bibliothèque
 * @param {string} query  1 à 3 mots (ou vide pour tout afficher)
 * @param {object} opts   { category, commercialOnly, favoritesOnly, sort, getIndex }
 *   getIndex(item) permet de fournir un index mis en cache.
 */
export function searchLibrary(items, query, opts = {}) {
  const {
    category = null,
    commercialOnly = false,
    favoritesOnly = false,
    sort = 'relevance',
    getIndex = indexItem,
  } = opts;
  const terms = tokenize(query).map(expandTerm);

  const results = [];
  for (const item of items) {
    if (category && item.category !== category) continue;
    if (favoritesOnly && !item.favorite) continue;
    if (commercialOnly) {
      const lic = item.source?.license;
      if (!(lic?.commercial === true || lic?.level === 'own')) continue;
    }
    let score = 0;
    if (terms.length) {
      const index = getIndex(item);
      let ok = true;
      for (const variants of terms) {
        const s = scoreTerm(index, variants);
        if (!s) { ok = false; break; }
        score += s;
      }
      if (!ok) continue;
    }
    if (item.favorite) score += 2;
    results.push({ item, score });
  }

  const byDate = (a, b) => String(b.item.addedAt).localeCompare(String(a.item.addedAt));
  const sorters = {
    relevance: (a, b) => b.score - a.score || byDate(a, b),
    recent: byDate,
    name: (a, b) => String(a.item.name).localeCompare(String(b.item.name), 'fr'),
    duration: (a, b) => (a.item.duration ?? 0) - (b.item.duration ?? 0),
  };
  results.sort(sorters[sort] ?? sorters.relevance);
  return results.map((r) => r.item);
}
