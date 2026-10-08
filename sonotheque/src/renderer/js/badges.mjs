// Pastilles « source » et « licence », et fiche détaillée affichée au survol.

import { h, formatDuration, formatSize, formatDate, hostOf } from './dom.mjs';
import { LEVEL_INFO } from '../../shared/licenses.mjs';
import { MEDIA_KINDS } from '../../shared/media-kinds.mjs';


/** Nom complet de la source, ex. « Openverse › Freesound ». */
export function sourceName(src) {
  if (!src) return 'Inconnue';
  return src.via && src.via !== src.providerLabel ? `${src.providerLabel} › ${src.via}` : src.providerLabel;
}

export function sourceBadge(src) {
  return h('span', { class: ['badge', 'badge-source'] }, sourceName(src));
}

/** Provenance compacte sur deux lignes : la source, puis la licence. */
export function provenance(src, license = src?.license) {
  return h('div', { class: 'prov' },
    h('span', { class: 'prov-src' }, sourceName(src)),
    licenseBadge(license));
}

/** Pastille de couleur de la catégorie + son nom. */
export function categoryTag(category) {
  return h('span', { class: 'cat' }, h('span', { class: ['dot', `dot-${category}`] }), categoryLabel(category));
}

export function licenseBadge(license) {
  const info = LEVEL_INFO[license?.level] ?? LEVEL_INFO.unknown;
  return h('span', { class: ['badge', 'badge-license', `lic-${info.color}`], title: info.help },
    license?.label ?? 'Inconnue');
}

export function categoryLabel(category) {
  const c = MEDIA_KINDS.audio.categories[category];
  return c ? c.label : category;
}

function row(label, value) {
  if (value === null || value === undefined || value === '') return null;
  return h('div', { class: 'tip-row' }, h('span', { class: 'tip-label' }, label), h('span', { class: 'tip-value' }, value));
}

/**
 * Fiche de détails (source, auteur, licence…) pour un résultat en ligne ou un son de la bibliothèque.
 * `entry` a la forme d'un résultat en ligne ; pour un son local on passe { ...item, source }.
 */
export function sourceCard({ title, source, duration, size, quality, note, addedAt, file, tags }) {
  const lic = source?.license;
  const info = LEVEL_INFO[lic?.level] ?? LEVEL_INFO.unknown;
  const isLocal = source?.provider === 'local';
  return h('div', { class: 'tip-card' },
    h('div', { class: 'tip-title' }, title),
    h('div', { class: 'tip-badges' }, sourceBadge(source), licenseBadge(lic)),
    h('div', { class: ['tip-license', `lic-text-${info.color}`] }, info.help),
    row('Source', isLocal ? 'Importé depuis ton ordinateur'
      : source?.provider === 'generated' ? `Généré par la Sonothèque (recette « ${source.recipe?.name ?? source.title} »)` : sourceName(source)),
    row('Auteur', source?.author),
    row("Page d'origine", source?.pageUrl ? `${hostOf(source.pageUrl)} — ${source.pageUrl}` : null),
    row('Fichier d\'origine', isLocal ? source?.originalPath : null),
    row('Qualité', quality ?? source?.quality),
    row('Durée', duration != null ? formatDuration(duration) : null),
    row('Taille', size ? formatSize(size) : null),
    row('Ajouté le', addedAt ? formatDate(addedAt) : null),
    row('Dans la biblio.', file),
    tags?.length ? row('Tags', tags.slice(0, 12).join(', ')) : null,
    note ? h('div', { class: 'tip-note' }, note) : null,
  );
}
