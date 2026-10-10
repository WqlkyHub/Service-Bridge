// Types de médias gérés par FoleyBox, et catégories de chaque type.
//
// Aujourd'hui seul « audio » est actif. Pour ajouter plus tard les effets visuels (overlays,
// transitions, textures vidéo…), il suffira d'ajouter une entrée ici (ex. « visual »), des
// sources qui déclarent `kinds: ['visual']`, et un lecteur adapté dans l'interface.
// La bibliothèque, la recherche, les mots-clés, les licences et les crédits sont déjà
// génériques : chaque élément porte un champ `kind`.
// Voir ROADMAP.md.

export const MEDIA_KINDS = {
  audio: {
    label: 'Audio',
    enabled: true,
    extensions: ['wav', 'mp3', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aif', 'aiff', 'webm'],
    // Formats que le lecteur intégré (Chromium) sait lire.
    playable: ['wav', 'mp3', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'webm'],
    categories: {
      sfx: { label: 'Bruitage', icon: '💥' },
      ambiance: { label: 'Ambiance', icon: '🌧️' },
      musique: { label: 'Musique', icon: '🎵' },
      voix: { label: 'Voix', icon: '🗣️' },
      autre: { label: 'Autre', icon: '📁' },
    },
  },
  visual: {
    label: 'Visuel',
    enabled: false, // à venir : overlays, transitions, textures, LUTs…
    extensions: ['mp4', 'mov', 'webm', 'png', 'gif'],
    playable: ['mp4', 'webm', 'png', 'gif'],
    categories: {
      overlay: { label: 'Overlay', icon: '✨' },
      transition: { label: 'Transition', icon: '🔀' },
      texture: { label: 'Texture', icon: '🎞️' },
    },
  },
};

export function kindForExtension(ext) {
  const e = String(ext).toLowerCase().replace(/^\./, '');
  for (const [kind, def] of Object.entries(MEDIA_KINDS)) {
    if (def.enabled && def.extensions.includes(e)) return kind;
  }
  return null;
}

export function isPlayable(kind, ext) {
  return MEDIA_KINDS[kind]?.playable.includes(String(ext).toLowerCase()) ?? false;
}

// Mots qui orientent la catégorie proposée automatiquement (comparés en version normalisée).
const CATEGORY_HINTS = {
  musique: ['music', 'musique', 'song', 'chanson', 'melody', 'beat', 'instrumental', 'piano', 'guitar',
    'guitare', 'orchestra', 'orchestral', 'drums', 'synth', 'jazz', 'rock', 'hiphop', 'lofi', 'track',
    'theme', 'soundtrack', 'cinematic', 'score', 'chill', 'epic', 'upbeat'],
  ambiance: ['ambience', 'ambiance', 'ambient', 'atmosphere', 'atmos', 'background', 'roomtone',
    'room', 'field', 'soundscape', 'environment', 'forest', 'foret', 'city', 'ville', 'street', 'rue',
    'crowd', 'foule', 'nature', 'rain', 'pluie', 'wind', 'vent', 'ocean', 'sea', 'mer', 'night', 'nuit',
    'traffic', 'circulation', 'restaurant', 'cafe', 'market', 'jungle', 'birds', 'oiseaux'],
  voix: ['voice', 'voix', 'speech', 'talk', 'dialogue', 'narration', 'whisper', 'chuchotement', 'vocal',
    'spoken', 'words', 'shout', 'scream', 'cri', 'laugh', 'rire'],
};

/**
 * Propose une catégorie à partir des mots (tags, nom…) et de la durée en secondes.
 * Simple heuristique : l'utilisateur peut toujours corriger.
 */
export function guessCategory(words, duration = null, { isMusicSource = false } = {}) {
  if (isMusicSource) return 'musique';
  const set = new Set(words);
  const score = (cat) => CATEGORY_HINTS[cat].filter((w) => set.has(w)).length;
  const music = score('musique');
  const amb = score('ambiance');
  const voice = score('voix');
  if (music > 0 && music >= amb && music >= voice) return 'musique';
  if (voice > 0 && voice > amb && (duration == null || duration < 120)) return 'voix';
  // Une ambiance dure en général plus de 20 s ; un bruitage court même « pluie » reste un SFX.
  if (amb > 0 && (duration == null || duration >= 20)) return 'ambiance';
  if (duration != null && duration >= 90) return amb > 0 ? 'ambiance' : 'musique';
  return 'sfx';
}
