// Registre des sources en ligne. Pour ajouter une source : créer un module qui exporte
// { id, label, kinds, homepage, description, needsKey, isConfigured, search, download, resolve? }
// puis l'ajouter à la liste ci-dessous.

import { openverse } from './openverse.mjs';
import { freesound } from './freesound.mjs';
import { jamendo } from './jamendo.mjs';
import { archive } from './archive.mjs';
import { bbc } from './bbc.mjs';

export const SOURCES = [freesound, openverse, jamendo, archive, bbc];

export function getSource(id) {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Source inconnue : ${id}`);
  return s;
}

/** Description publique des sources pour l'interface (sans fonctions). */
export function describeSources(settings) {
  return SOURCES.map((s) => ({
    id: s.id,
    label: s.label,
    kinds: s.kinds,
    homepage: s.homepage,
    description: s.description,
    needsKey: s.needsKey,
    keyHelp: s.keyHelp ?? null,
    configured: s.isConfigured(settings),
    enabled: settings.sources?.[s.id] !== false,
  }));
}
