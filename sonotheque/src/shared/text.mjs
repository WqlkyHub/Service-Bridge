// Outils texte partagés entre le processus principal et l'interface.

/** Minuscules, sans accents, espaces simplifiés. */
export function normalize(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Découpe en mots (lettres et chiffres), normalisés. */
export function tokenize(str) {
  return normalize(str)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Mots vides (FR + EN) à ignorer dans les suggestions de mots-clés. */
export const STOPWORDS = new Set([
  // français
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'et', 'ou', 'a', 'au', 'aux',
  'en', 'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'son', 'sa', 'ses', 'ce',
  'cette', 'ces', 'qui', 'que', 'est', 'tres', 'plus',
  // anglais
  'the', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'from', 'with', 'without', 'for',
  'by', 'is', 'it', 'its', 'this', 'that', 'my', 'very', 'into', 'some',
]);

/** Mots techniques fréquents dans les noms de fichiers audio, sans intérêt comme mot-clé. */
export const FILE_NOISE = new Set([
  'wav', 'mp3', 'flac', 'ogg', 'aif', 'aiff', 'm4a', 'aac', 'opus', 'webm', 'wma',
  'stereo', 'mono', 'st', 'ms', 'lr', 'take', 'tk', 'final', 'master', 'mix', 'edit', 'version',
  'v', 'ver', 'copy', 'copie', 'new', 'old', 'export', 'bounce', 'render', 'audio', 'sound',
  'sounds', 'sfx', 'fx', 'son', 'sons', 'file', 'track', 'piste', 'hq', 'lq', 'bit', 'khz',
  'hz', 'kbps', 'bpm', 'loop', 'part', 'clip', 'sample', 'samples', 'free', 'freesound',
  'download', 'downloads', 'telechargements', 'documents', 'desktop', 'bureau', 'users', 'user',
]);

/** Matériel d'enregistrement et abréviations de métier : jamais utiles comme mot-clé. */
export const GEAR_NOISE = new Set([
  'sennheiser', 'tascam', 'zoom', 'rode', 'sony', 'neumann', 'shure', 'roland', 'marantz', 'olympus',
  'h4n', 'h5', 'h6', 'zoomh4n', 'zoomh6', 'mkh', 'mkh416', 'me66', 'ntg', 'ntg2', 'ntg3', 'dr40', 'dr05',
  'pcm', 'binaural', 'ambisonic', 'ortf', 'xy', 'bg', 'sfx', 'fx', 'foley', 'field', 'recording',
  'fieldrecording', 'recorded', 'mic', 'microphone', 'micro', 'contact', 'hydrophone', 'cc0', 'cc',
]);

/** Vrai si le mot ressemble à du bruit (nombre, mesure technique, trop court…). */
export function isNoiseToken(tok) {
  if (tok.length < 3) return true;
  if (/^\d+$/.test(tok)) return true;
  if (/^\d+(k|khz|hz|bit|bits|kbps|s|ms|bpm|ch)$/.test(tok)) return true;
  if (/^(v|take|tk|t)\d+$/.test(tok)) return true;
  if (/^[a-f0-9]{8,}$/.test(tok)) return true; // identifiants / hash
  return STOPWORDS.has(tok) || FILE_NOISE.has(tok) || GEAR_NOISE.has(tok);
}

/** Met une majuscule à la première lettre. */
export function capitalize(str) {
  const s = String(str ?? '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
