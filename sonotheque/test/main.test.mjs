// Tests du processus principal (sans Electron) : bibliothèque, import, téléchargement, sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLibrary, safeFileName, INDEX_FILE } from '../src/main/library.mjs';
import { analyzeFiles, importEntries } from '../src/main/importer.mjs';
import { downloadToLibrary, fetchToFile } from '../src/main/downloader.mjs';
import { createSettingsStore } from '../src/main/settings.mjs';
import { setFetch } from '../src/main/http.mjs';
import { parseOpenverse } from '../src/main/sources/openverse.mjs';
import { parseFreesound, freesound } from '../src/main/sources/freesound.mjs';
import { parseJamendo, jamendo } from '../src/main/sources/jamendo.mjs';
import { parseArchiveDoc, applyArchiveMetadata } from '../src/main/sources/archive.mjs';

/** Fabrique un petit WAV 16 bits mono (sinusoïde) en mémoire. */
function makeWav(seconds = 0.5, freq = 440, rate = 8000) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sono-${name}-`));
}

test('noms de fichiers sûrs pour Windows', () => {
  assert.equal(safeFileName('Rain: "heavy" / roof?'), 'Rain heavy roof');
  assert.equal(safeFileName('CON'), '_CON');
  assert.equal(safeFileName('...'), 'son');
  assert.equal(safeFileName('a'.repeat(300)).length, 120);
});

test('import : analyse, suggestions, copie, doublons, persistance', async () => {
  const src = tmpDir('src');
  const root = tmpDir('lib');
  fs.mkdirSync(path.join(src, 'Portes'));
  fs.writeFileSync(path.join(src, 'Portes', 'DoorSlam_Heavy_01.wav'), makeWav(0.5, 300));
  fs.writeFileSync(path.join(src, 'Portes', 'Door creak.wav'), makeWav(0.7, 500));
  fs.writeFileSync(path.join(src, 'notes.txt'), 'pas un son');
  fs.writeFileSync(path.join(src, 'faux.mp3'), 'pas vraiment un mp3');

  const lib = createLibrary(root);
  const analysis = await analyzeFiles([src], lib);
  assert.equal(analysis.length, 3, 'le .txt est ignoré');
  const slam = analysis.find((e) => e.name === 'DoorSlam_Heavy_01');
  assert.deepEqual(slam.keywords, ['door', 'slam', 'heavy']);
  assert.equal(slam.category, 'sfx');
  assert.ok(Math.abs(slam.duration - 0.5) < 0.01);
  assert.ok(analysis.find((e) => e.name === 'faux').error, 'un faux mp3 est signalé');

  const ok = analysis.filter((e) => !e.error);
  const res = await importEntries(ok.map((e) => ({ ...e, keywords: ['porte', ...e.keywords] })), lib, { copy: true });
  assert.equal(res.added.length, 2);
  const item = res.added.find((i) => i.name === 'DoorSlam_Heavy_01');
  assert.deepEqual(item.keywords, ['porte', 'door', 'slam']);
  assert.equal(item.file, path.join('Sons', 'Bruitage', 'DoorSlam_Heavy_01.wav'));
  assert.ok(fs.existsSync(path.join(root, item.file)));
  assert.equal(item.source.provider, 'local');
  assert.equal(item.source.license.level, 'own');

  // Réimporter les mêmes fichiers : détectés comme doublons.
  const again = await analyzeFiles([src], lib);
  assert.ok(again.find((e) => e.name === 'DoorSlam_Heavy_01').duplicateOf);
  const res2 = await importEntries(again.filter((e) => !e.error), lib, { copy: true });
  assert.equal(res2.added.length, 0);
  assert.equal(res2.skipped.length, 2);

  // L'index est écrit sur disque et relu.
  lib.flush();
  assert.ok(fs.existsSync(path.join(root, INDEX_FILE)));
  const reopened = createLibrary(root);
  assert.equal(reopened.list().length, 2);
  assert.ok(fs.existsSync(path.join(root, '.sauvegardes')), 'sauvegarde du jour créée');
});

test('index abîmé : mis de côté, la bibliothèque repart de la sauvegarde', () => {
  const root = tmpDir('broken');
  const lib = createLibrary(root);
  lib.add({ name: 'a', file: 'Sons/a.wav' });
  lib.flush();
  createLibrary(root); // crée la sauvegarde du jour
  fs.writeFileSync(path.join(root, INDEX_FILE), '{ abîmé');
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const lib2 = createLibrary(root);
    assert.equal(lib2.list().length, 1);
  } finally {
    console.error = orig;
  }
  assert.ok(fs.readdirSync(root).some((f) => f.includes('.abime-')));
  // L'index est réparé tout de suite (sinon la sauvegarde du jour copierait le fichier abîmé).
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, INDEX_FILE), 'utf8')).items.length, 1);
});

test('index et sauvegarde abîmés, entrées incomplètes : la bibliothèque s\'ouvre quand même', () => {
  const root = tmpDir('broken2');
  fs.mkdirSync(path.join(root, '.sauvegardes'), { recursive: true });
  fs.writeFileSync(path.join(root, '.sauvegardes', 'bibliotheque-2026-01-01.json'),
    JSON.stringify({ items: [{ id: 'ok', file: 'Sons/a.wav' }, { id: 'sans-fichier' }, null] }));
  fs.writeFileSync(path.join(root, '.sauvegardes', 'bibliotheque-2026-01-02.json'), '{ abîmée aussi');
  fs.writeFileSync(path.join(root, INDEX_FILE), '{ abîmé');
  const orig = console.error;
  console.error = () => {};
  try {
    const lib = createLibrary(root);
    assert.deepEqual(lib.list().map((i) => i.id), ['ok']);
    assert.deepEqual(lib.get('ok').keywords, []);
  } finally {
    console.error = orig;
  }
});

function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404 });
    return new Response(r.body, { status: 200, headers: r.headers });
  };
}

test('téléchargement : fichier audio valide ajouté avec sa source et sa licence', async () => {
  const root = tmpDir('dl');
  const lib = createLibrary(root);
  const wav = makeWav(1.2, 200);
  setFetch(fakeFetch({ 'https://cdn.example.org/rain.wav': { body: wav, headers: { 'content-type': 'audio/wav', 'content-length': String(wav.length) } } }));
  const result = parseOpenverse({
    id: 'abc', title: 'Rain, Moderate.wav', creator: 'InspectorJ', foreign_landing_url: 'https://freesound.org/people/InspectorJ/sounds/401275',
    url: 'https://cdn.example.org/rain.wav', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'freesound', provider: 'freesound', filetype: 'wav', duration: 1200, tags: [{ name: 'rain' }, { name: 'weather' }],
  });
  const progress = [];
  const item = await downloadToLibrary(result, { url: result.raw.fileUrl, ext: 'wav', headers: {} },
    { keywords: ['pluie', 'Pluie', 'toit', 'nuit', 'trop'], category: 'ambiance', name: 'Pluie modérée' }, lib,
    { onProgress: (r, t) => progress.push([r, t]) });
  assert.deepEqual(item.keywords, ['pluie', 'toit', 'nuit']);
  assert.equal(item.category, 'ambiance');
  assert.equal(item.file, path.join('Sons', 'Ambiance', 'Pluie modérée.wav'));
  assert.equal(item.source.provider, 'openverse');
  assert.equal(item.source.via, 'Freesound');
  assert.equal(item.source.author, 'InspectorJ');
  assert.equal(item.source.license.label, 'CC BY 4.0');
  assert.equal(item.source.pageUrl, 'https://freesound.org/people/InspectorJ/sounds/401275');
  assert.ok(item.tags.includes('weather'));
  assert.ok(progress.length > 0);
  assert.ok(lib.findBySource(null, 'https://freesound.org/people/InspectorJ/sounds/401275'));
});

test('téléchargement : refuse HTTP, page HTML et faux audio', async () => {
  const root = tmpDir('dl2');
  const lib = createLibrary(root);
  setFetch(fakeFetch({
    'https://x.org/page': { body: '<html></html>', headers: { 'content-type': 'text/html' } },
    'https://x.org/fake.mp3': { body: 'nope nope nope', headers: { 'content-type': 'audio/mpeg' } },
  }));
  await assert.rejects(fetchToFile('http://x.org/a.mp3', root, 'a'), /HTTPS/);
  await assert.rejects(fetchToFile('https://x.org/page', root, 'a'), /page web/);
  // Une redirection qui finit sur une adresse HTTP est refusée elle aussi.
  setFetch(async () => Object.defineProperty(new Response(makeWav(), { headers: { 'content-type': 'audio/wav' } }), 'url', { value: 'http://x.org/a.wav' }));
  await assert.rejects(fetchToFile('https://x.org/redirige', root, 'a'), /non sécurisée/);
  setFetch(fakeFetch({ 'https://x.org/fake.mp3': { body: 'nope nope nope', headers: { 'content-type': 'audio/mpeg' } } }));
  const result = parseOpenverse({ id: 'z', title: 'Fake', url: 'https://x.org/fake.mp3', license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/' });
  await assert.rejects(downloadToLibrary(result, { url: 'https://x.org/fake.mp3', ext: 'mp3' }, { keywords: ['x'], category: 'sfx' }, lib), /pas un audio valide/);
  const leftovers = fs.readdirSync(path.join(root, 'Sons', 'Bruitage'));
  assert.deepEqual(leftovers, [], 'aucun fichier partiel ne reste');
});

test('réglages : clés chiffrées sur disque, jamais renvoyées à l\'interface', () => {
  const dir = tmpDir('settings');
  const file = path.join(dir, 'reglages.json');
  const crypto = { encrypt: (s) => Buffer.from(s).toString('base64'), decrypt: (s) => Buffer.from(s, 'base64').toString() };
  const store = createSettingsStore({ file, defaultLibraryPath: '/lib', crypto });
  store.update({ freesound: { apiKey: 'SECRET123', clientId: 'cid' }, jamendo: { clientId: 'JAM' } });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('SECRET123') && !raw.includes('"JAM"'));
  const pub = store.publicView();
  assert.equal(pub.freesound.hasApiKey, true);
  assert.ok(!JSON.stringify(pub).includes('SECRET123'));
  const reloaded = createSettingsStore({ file, defaultLibraryPath: '/lib', crypto });
  assert.equal(reloaded.get().freesound.apiKey, 'SECRET123');
  assert.equal(reloaded.get().jamendo.clientId, 'JAM');
  assert.equal(reloaded.get().sources.openverse, true, 'valeurs par défaut conservées');
});

test('sources : lecture des réponses Freesound, Jamendo, Archive', async () => {
  const fs1 = parseFreesound({
    id: 42, name: 'Glass break.wav', tags: ['glass', 'break'], description: '<b>Recorded</b> in kitchen', license: 'http://creativecommons.org/publicdomain/zero/1.0/',
    username: 'bob', url: 'https://freesound.org/people/bob/sounds/42/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/0/42-hq.mp3' },
    duration: 1.5, type: 'wav', samplerate: 48000, channels: 2,
  });
  assert.equal(fs1.key, 'freesound:42');
  assert.equal(fs1.license.level, 'free');
  assert.equal(fs1.note, 'Recorded in kitchen');
  const plan = await freesound.download(fs1, { getAccessToken: async () => null });
  assert.equal(plan.url, 'https://cdn.freesound.org/previews/0/42-hq.mp3');
  const planOrig = await freesound.download(fs1, { getAccessToken: async () => 'TOKEN' });
  assert.equal(planOrig.headers.Authorization, 'Bearer TOKEN');
  assert.equal(planOrig.ext, 'wav');

  const jm = parseJamendo({ id: '7', name: 'Calm', artist_name: 'Ann', shareurl: 'https://jamen.do/t/7', audio: 'https://s/7.mp3', audiodownload: 'https://d/7.mp3', audiodownload_allowed: true, license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/', duration: 120, musicinfo: { tags: { genres: ['ambient'], vartags: ['calm'], instruments: ['piano'] } } });
  assert.equal(jm.license.level, 'nc');
  assert.deepEqual(jm.tags, ['ambient', 'calm', 'piano']);
  assert.equal((await jamendo.download(jm)).url, 'https://d/7.mp3');
  const jmNo = parseJamendo({ id: '8', name: 'X', audio: 'https://s/8.mp3', audiodownload_allowed: false });
  assert.equal(jmNo.downloadable, false);
  await assert.rejects(jamendo.download(jmNo), /n'autorise pas/);

  const ar = parseArchiveDoc({ identifier: 'old-door', title: 'Old door', subject: ['door; creak', 'sfx'] });
  assert.deepEqual(ar.tags, ['door', 'creak', 'sfx']);
  assert.equal(ar.needsResolve, true);
  const resolved = applyArchiveMetadata(ar, {
    metadata: { licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' },
    files: [
      { name: 'door 1.flac', format: 'Flac', size: '1000', length: '3.5' },
      { name: 'door 1.mp3', format: 'VBR MP3', length: '3.5' },
      { name: 'door 2.mp3', format: 'VBR MP3', length: '4' },
      { name: 'cover.jpg', format: 'JPEG' },
    ],
  });
  assert.equal(resolved.previewUrl, 'https://archive.org/download/old-door/door%201.mp3');
  assert.equal(resolved.raw.downloadUrl, 'https://archive.org/download/old-door/door%201.flac');
  assert.equal(resolved.license.level, 'free');
  assert.equal(resolved.duration, 3.5);
  assert.match(resolved.note, /2 fichiers audio/);
});
