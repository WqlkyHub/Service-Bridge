// Requêtes HTTP du processus principal.
// Dans l'application, on utilise `net.fetch` d'Electron (qui respecte le proxy de Windows) ;
// dans les tests, le `fetch` de Node. Voir setFetch() dans main.mjs.

let fetchImpl = globalThis.fetch;

export const USER_AGENT = 'FoleyBox/0.4 (banque de sons pour le montage video)';

export function setFetch(fn) {
  fetchImpl = fn;
}

export function getFetch() {
  return fetchImpl;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** GET JSON avec délai maximum. Lève HttpError avec un message lisible en cas d'échec. */
export async function getJson(url, { headers = {}, timeoutMs = 15000, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      body,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new HttpError(0, 'La source met trop de temps à répondre.');
    throw new HttpError(0, 'Impossible de joindre la source (connexion internet ?).');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const messages = {
      401: 'Clé API refusée : vérifie-la dans les Réglages.',
      403: 'Accès refusé par la source (clé API ou droits).',
      404: 'Élément introuvable sur la source.',
      429: 'Trop de recherches d\'un coup : la source demande de patienter un peu.',
    };
    throw new HttpError(res.status, messages[res.status] ?? `La source a répondu une erreur (${res.status}).`);
  }
  return res.json();
}

/** Construit une URL avec paramètres (les valeurs nulles sont ignorées). */
export function buildUrl(base, params = {}) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, String(v));
  }
  return u.toString();
}
