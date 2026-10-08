import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, tokenize } from '../src/shared/text.mjs';
import { translateQuery, equivalents } from '../src/shared/synonyms.mjs';
import { cleanKeywords, parseKeywordInput, suggestFromPath, suggestFromOnline, extraTags } from '../src/shared/keywords.mjs';
import { describeLicense, licenseCode, allowedCommercially, creditLine } from '../src/shared/licenses.mjs';
import { searchLibrary } from '../src/shared/search.mjs';
import { guessCategory, kindForExtension, isPlayable } from '../src/shared/media-kinds.mjs';

test('normalize / tokenize ignorent accents et casse', () => {
  assert.equal(normalize('  Forêt  ÉTÉ '), 'foret ete');
  assert.deepEqual(tokenize('Porte_qui-grince (v2).wav'), ['porte', 'qui', 'grince', 'v2', 'wav']);
});

test('traduction FR → EN des recherches en ligne', () => {
  assert.deepEqual(translateQuery('pluie forte'), { query: 'rain heavy', translated: true });
  assert.equal(translateQuery('coup de feu').query, 'gunshot');
  assert.equal(translateQuery('bruit de pas gravier').query, 'footsteps gravel');
  assert.equal(translateQuery('bruit de porte').query, 'door');
  assert.deepEqual(translateQuery('whoosh'), { query: 'whoosh', translated: false });
  assert.deepEqual(translateQuery('rain'), { query: 'rain', translated: false });
});

test('équivalents dans les deux sens', () => {
  assert.ok(equivalents('pluie').includes('rain'));
  assert.ok(equivalents('rain').includes('pluie'));
  assert.ok(equivalents('Forêt').includes('forest'));
});

test('mots-clés : nettoyage, limite à 3, saisie rapide', () => {
  assert.deepEqual(cleanKeywords(['Pluie', 'pluie', ' forte ', 'nuit', 'orage']), ['pluie', 'forte', 'nuit']);
  assert.deepEqual(cleanKeywords(['forêt', 'foret']), ['forêt']);
  assert.deepEqual(parseKeywordInput('pluie forte nuit'), ['pluie', 'forte', 'nuit']);
  assert.deepEqual(parseKeywordInput('coup de feu, lointain'), ['coup de feu', 'lointain']);
});

test('suggestions depuis un chemin de fichier Windows', () => {
  assert.deepEqual(suggestFromPath('C:\\Users\\me\\SFX\\Portes\\DoorSlam_Heavy_01_48kHz.wav'), ['door', 'slam', 'heavy']);
  assert.deepEqual(suggestFromPath('/home/me/Ambiances/foret nuit grillons.mp3'), ['foret', 'nuit', 'grillons']);
  // Les mots techniques sont ignorés, le dossier complète.
  assert.deepEqual(suggestFromPath('D:\\Sons\\Whoosh\\take 3 final stereo.wav'), ['whoosh']);
});

test('suggestions pour un son en ligne : ta recherche d\'abord', () => {
  assert.deepEqual(suggestFromOnline('pluie forte', ['rain', 'weather', 'Raindrops']), ['pluie', 'forte', 'rain']);
  assert.deepEqual(suggestFromOnline('', ['Rain', 'rain', 'weather'], 'Rain moderate'), ['rain', 'weather', 'moderate']);
  assert.deepEqual(extraTags(['Rain', 'weather', 'rain'], ['rain']), ['weather']);
});

test('licences : codes et niveaux', () => {
  assert.equal(licenseCode('https://creativecommons.org/publicdomain/zero/1.0/'), 'cc0');
  assert.equal(licenseCode('http://creativecommons.org/licenses/by-nc/4.0/'), 'by-nc');
  assert.equal(licenseCode('https://creativecommons.org/licenses/by-sa/3.0/'), 'by-sa');
  assert.equal(licenseCode('Attribution Noncommercial'), 'by-nc');
  assert.equal(licenseCode('Creative Commons 0'), 'cc0');
  assert.equal(licenseCode('by'), 'by');
  assert.equal(licenseCode(''), 'unknown');
  assert.equal(licenseCode('n\'importe quoi'), 'unknown');

  const by = describeLicense('by', { version: '4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });
  assert.equal(by.label, 'CC BY 4.0');
  assert.equal(by.commercial, true);
  assert.equal(by.attribution, true);
  assert.equal(describeLicense('by-nc-sa').commercial, false);
  assert.equal(describeLicense(null).commercial, null);
  assert.ok(allowedCommercially(describeLicense('cc0')));
  assert.ok(!allowedCommercially(describeLicense('by-nc')));
  assert.ok(!allowedCommercially(describeLicense(null)));
  assert.ok(allowedCommercially(describeLicense('own')));
});

test('ligne de crédit', () => {
  const line = creditLine({ title: 'Rain', author: 'InspectorJ', sourceLabel: 'Freesound', license: describeLicense('by', { version: '4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }), pageUrl: 'https://freesound.org/s/1/' });
  assert.equal(line, '« Rain » par InspectorJ (Freesound) – CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) – https://freesound.org/s/1/');
});

const lib = [
  { id: '1', name: 'Rain heavy roof', keywords: ['pluie', 'toit'], tags: ['rain', 'storm'], category: 'ambiance', addedAt: '2026-01-01', source: { license: describeLicense('by') } },
  { id: '2', name: 'Door slam', keywords: ['porte', 'claque'], tags: ['door'], category: 'sfx', addedAt: '2026-01-02', source: { license: describeLicense('cc0') } },
  { id: '3', name: 'Forest night', keywords: ['forêt', 'nuit'], tags: ['crickets'], category: 'ambiance', favorite: true, addedAt: '2026-01-03', source: { license: describeLicense('by-nc') } },
  { id: '4', name: 'Pluie fine', keywords: ['pluie'], tags: [], category: 'ambiance', addedAt: '2026-01-04', source: { license: describeLicense('own') } },
];
const ids = (arr) => arr.map((x) => x.id);

test('recherche locale : mots-clés, préfixes, langues', () => {
  assert.deepEqual(ids(searchLibrary(lib, 'pluie')).sort(), ['1', '4']);
  assert.deepEqual(ids(searchLibrary(lib, 'rain')).sort(), ['1', '4']); // « rain » trouve aussi « pluie »
  assert.deepEqual(ids(searchLibrary(lib, 'plu')).sort(), ['1', '4']); // début de mot
  assert.deepEqual(ids(searchLibrary(lib, 'porte')), ['2']);
  assert.deepEqual(ids(searchLibrary(lib, 'door')), ['2']);
  assert.deepEqual(ids(searchLibrary(lib, 'foret nuit')), ['3']); // sans accent, deux mots
  assert.deepEqual(ids(searchLibrary(lib, 'pluie porte')), []); // ET logique
  assert.deepEqual(ids(searchLibrary(lib, 'portes')), ['2']); // pluriel
});

test('recherche locale : filtres et tri', () => {
  assert.equal(searchLibrary(lib, '').length, 4);
  assert.deepEqual(ids(searchLibrary(lib, '', { category: 'sfx' })), ['2']);
  assert.deepEqual(ids(searchLibrary(lib, '', { favoritesOnly: true })), ['3']);
  assert.deepEqual(ids(searchLibrary(lib, '', { commercialOnly: true })).sort(), ['1', '2', '4']);
  assert.deepEqual(ids(searchLibrary(lib, '', { sort: 'recent' })), ['4', '3', '2', '1']);
  assert.deepEqual(ids(searchLibrary(lib, '', { sort: 'name' })), ['2', '3', '4', '1']);
  // Un mot-clé exact pèse plus qu'un tag ou un début de mot.
  const extra = [...lib, { id: '5', name: 'Pluvial', keywords: ['eau'], tags: ['pluie'], category: 'sfx', addedAt: '2026-02-01', source: {} }];
  assert.equal(searchLibrary(extra, 'pluie').at(-1).id, '5');
});

test('catégorie proposée', () => {
  assert.equal(guessCategory(['door', 'slam'], 1.2), 'sfx');
  assert.equal(guessCategory(['rain', 'roof'], 60), 'ambiance');
  assert.equal(guessCategory(['rain', 'drop'], 2), 'sfx');
  assert.equal(guessCategory(['piano', 'calm'], 140), 'musique');
  assert.equal(guessCategory([], 200, { isMusicSource: true }), 'musique');
  assert.equal(guessCategory(['whisper'], 4), 'voix');
});

test('types de fichiers', () => {
  assert.equal(kindForExtension('WAV'), 'audio');
  assert.equal(kindForExtension('.mp3'), 'audio');
  assert.equal(kindForExtension('mp4'), null); // visuels pas encore activés
  assert.equal(kindForExtension('exe'), null);
  assert.ok(isPlayable('audio', 'flac'));
  assert.ok(!isPlayable('audio', 'aiff'));
});
