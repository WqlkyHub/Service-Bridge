// Classement des licences des sons, pour savoir d'un coup d'œil ce qu'on a le droit d'en faire.
//
// level :
//  - 'free'  (vert)   : domaine public / CC0 — utilisable partout, sans créditer.
//  - 'credit'(jaune)  : CC BY / CC BY-SA — usage commercial OK, mais il faut créditer l'auteur.
//  - 'nomod' (orange) : CC BY-ND — usage commercial OK, créditer, et ne pas modifier le son.
//  - 'nc'    (rouge)  : NC (non commercial) — interdit dans une vidéo monétisée ou pour un client.
//  - 'unknown'(gris)  : licence inconnue — à vérifier sur la page d'origine avant usage.
//  - 'own'   (bleu)   : fichier importé depuis ton ordinateur — c'est à toi de connaître ses droits.

const CC_LABELS = {
  'cc0': 'CC0',
  'pdm': 'Domaine public',
  'by': 'CC BY',
  'by-sa': 'CC BY-SA',
  'by-nd': 'CC BY-ND',
  'by-nc': 'CC BY-NC',
  'by-nc-sa': 'CC BY-NC-SA',
  'by-nc-nd': 'CC BY-NC-ND',
  'sampling+': 'Sampling+',
  'nc-sampling+': 'NC Sampling+',
  'own': 'Perso',
  'generated': 'Créé par toi',
  'unknown': 'Inconnue',
};

const LEVEL_BY_CODE = {
  'cc0': 'free', 'pdm': 'free',
  'by': 'credit', 'by-sa': 'credit',
  'by-nd': 'nomod',
  'by-nc': 'nc', 'by-nc-sa': 'nc', 'by-nc-nd': 'nc', 'nc-sampling+': 'nc',
  'sampling+': 'unknown',
  'own': 'own',
  'generated': 'free',
  'unknown': 'unknown',
};

export const LEVEL_INFO = {
  free: { color: 'green', short: 'Libre', help: 'Utilisable partout, même en vidéo monétisée, sans créditer.' },
  credit: { color: 'yellow', short: 'Créditer', help: "Usage commercial autorisé, à condition de créditer l'auteur (description de la vidéo)." },
  nomod: { color: 'orange', short: 'Sans modif.', help: "Usage commercial autorisé en créditant l'auteur, mais le son ne doit pas être modifié (ni coupé ni retouché)." },
  nc: { color: 'red', short: 'Non commercial', help: 'Interdit dans une vidéo monétisée ou pour un client. Usage perso uniquement.' },
  unknown: { color: 'gray', short: 'À vérifier', help: "Licence non précisée : vérifie sur la page d'origine avant de l'utiliser." },
  own: { color: 'blue', short: 'Perso', help: "Fichier importé depuis ton ordinateur : c'est à toi de connaître ses droits." },
};

/**
 * Déduit le code de licence à partir d'une URL Creative Commons, d'un code court (« by-nc »),
 * ou d'un nom (« Attribution Noncommercial »).
 */
export function licenseCode(input) {
  const s = String(input ?? '').toLowerCase().trim();
  if (!s) return 'unknown';
  if (s === 'own') return 'own';
  if (s === 'generated') return 'generated';
  if (s.includes('publicdomain/zero') || s === 'cc0' || s.includes('creative commons 0')) return 'cc0';
  if (s.includes('publicdomain/mark') || s === 'pdm' || s.includes('public domain')) return 'pdm';
  if (s.includes('nc-sampling+') || s.includes('noncommercial sampling')) return 'nc-sampling+';
  if (s.includes('sampling+') || s.includes('sampling plus')) return 'sampling+';

  // URL du type creativecommons.org/licenses/by-nc-sa/3.0/
  const m = s.match(/licenses\/([a-z-]+)\//) || s.match(/licenses\/([a-z-]+)$/);
  let code = m ? m[1] : s;

  // Noms en toutes lettres (Freesound, Archive…)
  if (!m) {
    const hasBy = /attribution|\bby\b/.test(code);
    const nc = /non-?commercial|\bnc\b/.test(code);
    const nd = /no-?deriv|\bnd\b/.test(code);
    const sa = /share-?alike|\bsa\b/.test(code);
    if (hasBy || nc || nd || sa) {
      code = ['by', nc && 'nc', nd && 'nd', sa && 'sa'].filter(Boolean).join('-');
    }
  }
  return CC_LABELS[code] ? code : 'unknown';
}

/** Objet licence complet, stocké avec chaque son. */
export function describeLicense(input, { url = null, version = null } = {}) {
  const code = licenseCode(input);
  const level = LEVEL_BY_CODE[code];
  let label = CC_LABELS[code];
  if (version && !['cc0', 'pdm', 'own', 'generated', 'unknown'].includes(code)) label += ` ${version}`;
  return {
    code,
    label,
    level,
    url: url || (typeof input === 'string' && /^https?:/.test(input) ? input : null),
    commercial: level === 'free' || level === 'credit' || level === 'nomod' ? true
      : level === 'nc' ? false : null,
    attribution: level === 'credit' || level === 'nomod',
  };
}

/** Vrai si le son peut apparaître quand le filtre « usage commercial » est actif. */
export function allowedCommercially(license) {
  return license?.commercial === true || license?.level === 'own';
}

/** Ligne de crédit à coller dans la description d'une vidéo. */
export function creditLine({ title, author, sourceLabel, license, pageUrl }) {
  const parts = [`« ${title} »`];
  if (author) parts.push(`par ${author}`);
  if (sourceLabel) parts.push(`(${sourceLabel})`);
  let line = parts.join(' ');
  if (license?.label) line += ` – ${license.label}`;
  if (license?.url) line += ` (${license.url})`;
  if (pageUrl) line += ` – ${pageUrl}`;
  return line;
}
