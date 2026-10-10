// Passage des scores du modèle de reconnaissance (une note par catégorie, ex. « Rain on surface »)
// aux mots cherchables d'un son.

import { usefulWords } from './keywords.mjs';
import { FR_EN } from './synonyms.mjs';
import { normalize } from './text.mjs';

// Catégories trop vagues pour aider à retrouver un son.
const GENERIC = new Set(['Sound effect', 'Silence', 'Noise', 'Environmental noise', 'Static', 'Field recording',
  'Inside, small room', 'Inside, large room or hall', 'Inside, public space', 'Outside, urban or manmade', 'Outside, rural or natural',
  'Animal', 'Domestic animals, pets', 'Livestock, farm animals, working animals', 'Wild animals', 'Musical instrument', 'Vehicle']);

/** Les catégories reconnues avec assez de certitude, de la plus sûre à la moins sûre. */
export function pickClasses(scores, classes, { min = 0.3, max = 4 } = {}) {
  return scores.map((score, i) => ({ label: classes[i], score }))
    .filter((c) => c.label && c.score >= min && !GENERIC.has(c.label))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** Mots cherchables tirés des catégories : « Whoosh, swoosh, swish » → whoosh, swoosh, swish. */
export function tagWords(picked) {
  return [...new Set(picked.flatMap((c) => usefulWords(c.label)))];
}

// ---------------------------------------------------------------------------
// Empreinte d'un son : le modèle résume ce qu'il entend en 1024 nombres. Deux sons qui se
// ressemblent ont des empreintes proches. On la réduit à 128 valeurs d'un octet (172 caractères
// dans l'index) par une projection fixe, ce qui garde l'essentiel des ressemblances.

const EMB_DIM = 128;
let projection = null; // 128 × 1024 signes (+1 / −1), toujours les mêmes

function signs(inputSize) {
  if (projection?.length === EMB_DIM * inputSize) return projection;
  projection = new Int8Array(EMB_DIM * inputSize);
  let a = 0x50f7a11;
  for (let i = 0; i < projection.length; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    projection[i] = (t ^ (t >>> 14)) & 1 ? 1 : -1;
  }
  return projection;
}

/** Empreinte complète → texte compact à ranger dans l'index (null si elle est vide). */
export function packEmbedding(embedding) {
  const p = signs(embedding.length);
  // Les valeurs du modèle sont toutes positives : sans les recentrer, tous les sons se
  // « ressembleraient ». On retire la moyenne pour ne comparer que ce qui les distingue.
  const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
  const out = new Float64Array(EMB_DIM);
  for (let d = 0; d < EMB_DIM; d++) {
    let sum = 0;
    for (let i = 0; i < embedding.length; i++) sum += p[d * embedding.length + i] * (embedding[i] - mean);
    out[d] = sum;
  }
  const max = Math.max(...out.map(Math.abs));
  if (!max) return null;
  return btoa(String.fromCharCode(...out.map((v) => Math.round((v / max) * 127) & 0xff)));
}

/** Texte de l'index → vecteur de longueur 1, prêt à être comparé (null si illisible). */
export function unpackEmbedding(text) {
  let bin;
  try {
    bin = atob(String(text ?? ''));
  } catch {
    return null;
  }
  if (bin.length !== EMB_DIM) return null;
  const v = Float32Array.from(bin, (c) => (c.charCodeAt(0) << 24) >> 24); // octet signé
  const norm = Math.hypot(...v);
  return norm ? v.map((x) => x / norm) : null;
}

/** Ressemblance de deux empreintes dépaquetées : 1 = identiques, 0 = sans rapport. */
export function similarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Dictionnaire inversé : le mot français correspondant à un mot anglais, quand on le connaît.
const EN_FR = new Map();
for (const [fr, list] of Object.entries(FR_EN)) for (const en of list) if (!EN_FR.has(normalize(en))) EN_FR.set(normalize(en), fr);

/** Pour l'affichage : « rain » → « pluie » (le mot est gardé tel quel s'il n'est pas dans le dictionnaire). */
export function frenchWord(word) {
  return EN_FR.get(normalize(word)) ?? word;
}
