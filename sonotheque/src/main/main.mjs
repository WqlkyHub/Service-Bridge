// Processus principal d'Electron : fenêtre, accès disque, réseau et dialogue avec l'interface.

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, safeStorage, nativeImage, clipboard, Menu, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { setFetch } from './http.mjs';
import { createSettingsStore } from './settings.mjs';
import { createLibrary, safeFileName, uniquePath } from './library.mjs';
import { analyzeFiles, importEntries } from './importer.mjs';
import { downloadToLibrary } from './downloader.mjs';
import { SOURCES, getSource, describeSources } from './sources/index.mjs';
import { connectFreesound, getFreesoundAccessToken } from './freesound-auth.mjs';
import { createSynth, USER_RECIPES_DIR, BUILTIN_DIR } from './synth.mjs';
import { createTagger, taggerAvailable, readClasses } from './tagger.mjs';
import { readAudioInfo, quickHash } from './media-info.mjs';
import { describeLicense } from '../shared/licenses.mjs';
import { encodePeaks } from '../shared/peaks.mjs';
import { cleanKeywords, extraTags } from '../shared/keywords.mjs';
import { MEDIA_KINDS, isPlayable } from '../shared/media-kinds.mjs';
import { pickClasses, tagWords, frenchWord, packEmbedding } from '../shared/sound-tags.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.cjs');
const SCHEME = 'sfxlib';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------------------------------------------------------------------------
// Journal des erreurs : en cas de plantage, l'erreur est écrite dans un fichier et affichée,
// au lieu que l'appli se ferme sans rien dire.

function logError(context, err) {
  const text = `[${new Date().toISOString()}] ${context}\n${err?.stack ?? err}\n\n`;
  try {
    const dir = app.getPath('userData');
    const file = path.join(dir, 'erreurs.log');
    fs.mkdirSync(dir, { recursive: true });
    // Le journal ne grossit pas sans fin : au-delà de 1 Mo, on repart de zéro.
    if (fs.statSync(file, { throwIfNoEntry: false })?.size > 1024 * 1024) fs.rmSync(file, { force: true });
    fs.appendFileSync(file, text);
  } catch { /* rien de plus à faire */ }
  console.error(text);
}

function fatal(context, err) {
  logError(context, err);
  let where = '';
  try {
    where = `\n\nDétails enregistrés dans :\n${path.join(app.getPath('userData'), 'erreurs.log')}`;
  } catch { /* chemin indisponible */ }
  dialog.showErrorBox('Sonothèque : erreur au démarrage', `${err?.message ?? err}${where}`);
  app.exit(1);
}

process.on('uncaughtException', (err) => logError('Erreur non gérée', err));
process.on('unhandledRejection', (err) => logError('Promesse rejetée', err));

// Dossier de données séparé (tests automatiques, ou plusieurs profils).
if (process.env.SONOTHEQUE_DATA_DIR) app.setPath('userData', process.env.SONOTHEQUE_DATA_DIR);

// Une seule instance : la deuxième s'arrête tout de suite, sans toucher à la bibliothèque.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();

/** @type {BrowserWindow|null} */
let mainWindow = null;
let settings;
let library;
let unsubscribeLibrary = null;
let synth;
let tagger = null; // reconnaissance des sons (absente si le modèle n'a pas été téléchargé)
let soundClasses = [];
// Résultats de recherche en ligne gardés côté principal : l'interface ne demande un
// téléchargement que par identifiant, jamais avec une URL arbitraire.
const resultCache = new Map();
const MAX_CACHED_RESULTS = 3000;

// ---------------------------------------------------------------------------
// Utilitaires

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function openLibrary(root) {
  unsubscribeLibrary?.();
  library?.flush();
  library = createLibrary(root);
  unsubscribeLibrary = library.onChange(({ kind, ids }) => {
    if (kind === 'remove') send('lib:changed', { kind, ids });
    else send('lib:changed', { kind, items: ids.map((id) => library.get(id)).filter(Boolean) });
    if (kind === 'add') tagLibrary();
  });
  tagLibrary();
}

// ---------------------------------------------------------------------------
// Mots-clés automatiques : en arrière-plan, un son à la fois, on écoute chaque son pas encore
// analysé et on ajoute ce qui y est reconnu à ses tags (cherchables). Un son sans aucun
// mot-clé reçoit aussi les trois premiers comme mots-clés.

const MAX_TAG_BYTES = 80 * 1024 * 1024;
const ANALYSIS_VERSION = 2; // à augmenter si l'analyse change : les sons seront réécoutés
let tagging = false;
const tagTried = new Set(); // fichiers illisibles pour l'instant : on réessaiera au prochain lancement

async function tagLibrary() {
  if (tagging || !tagger || settings.get().autoTags === false) return;
  tagging = true;
  try {
    for (;;) {
      const lib = library;
      const it = lib.list().find((x) => x.analyzed !== ANALYSIS_VERSION && !tagTried.has(x.id) && isPlayable(x.kind, x.ext) && !(x.size > MAX_TAG_BYTES));
      if (!it || settings.get().autoTags === false) break;
      tagTried.add(it.id);
      let bytes;
      try {
        bytes = await fs.promises.readFile(lib.absPath(it));
      } catch {
        continue; // fichier absent (disque débranché…)
      }
      let words = [];
      let emb = null;
      try {
        const heard = await tagger.analyze(bytes);
        words = tagWords(pickClasses(heard.scores, soundClasses));
        emb = packEmbedding(heard.embedding);
      } catch (err) {
        if (!err.unreadable) break; // moteur arrêté ou bloqué : on reprendra plus tard
        // sinon : format que le moteur ne sait pas décoder, on n'insiste pas sur ce son
      }
      const cur = lib.get(it.id);
      if (!cur) continue; // supprimé entre-temps
      const keywords = cur.keywords.length ? cur.keywords : cleanKeywords(words.map(frenchWord));
      lib.update(it.id, { analyzed: ANALYSIS_VERSION, emb, keywords, tags: extraTags([...cur.tags, ...words], keywords) });
      await new Promise((r) => setTimeout(r, 30));
    }
  } catch (err) {
    logError('Mots-clés automatiques', err);
  } finally {
    tagging = false;
  }
}

function cacheResult(r) {
  resultCache.delete(r.key);
  resultCache.set(r.key, r);
  if (resultCache.size > MAX_CACHED_RESULTS) resultCache.delete(resultCache.keys().next().value);
}

/** Ce que l'interface reçoit d'un résultat (sans données internes). */
function publicResult(r) {
  const { raw, ...rest } = r;
  const inLib = library.findBySource(r.key, r.pageUrl);
  return { ...rest, inLibrary: inLib ? inLib.id : null };
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Petite icône (note de musique stylisée) affichée sous la souris pendant un glisser-déposer. */
function dragIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - 15.5;
      const dy = y - 15.5;
      const inside = dx * dx + dy * dy <= 15 * 15;
      // BGRA : violet de l'interface
      buf[i] = 0xf0; buf[i + 1] = 0x5b; buf[i + 2] = 0x8b; buf[i + 3] = inside ? 0xee : 0;
      const bar = Math.abs(x - 15.5) < 7 && Math.abs(Math.sin(x / 2.2) * 7) > Math.abs(dy);
      if (inside && bar) { buf[i] = buf[i + 1] = buf[i + 2] = 0xff; }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// ---------------------------------------------------------------------------
// Lecture des fichiers de la bibliothèque : sfxlib://item/<id>  (avec support du « Range »
// pour pouvoir se déplacer dans un son long).

async function serveLibraryFile(request) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const item = url.hostname === 'item' ? library.get(id) : null;
  const file = item ? library.absPath(item) : null;
  if (!file || !fs.existsSync(file)) return new Response('Introuvable', { status: 404 });

  const { size } = fs.statSync(file);
  const types = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', aif: 'audio/aiff', aiff: 'audio/aiff' };
  const type = types[item.ext] ?? 'application/octet-stream';
  const range = request.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/) ?? ['', '', ''];
    let start;
    let end;
    if (m[1] === '' && m[2] !== '') {
      // « bytes=-500 » : les 500 derniers octets
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1] || 0);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = fs.createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
  });
}

// ---------------------------------------------------------------------------
// Fenêtre

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 600,
    title: 'Sonothèque',
    backgroundColor: '#e3ebea',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.loadFile(RENDERER);
  // Toujours afficher la fenêtre au premier plan, même si l'appli a été lancée « réduite ».
  const reveal = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  mainWindow.once('ready-to-show', reveal);
  setTimeout(reveal, 4000); // filet de sécurité si l'interface tarde à se charger
  mainWindow.webContents.on('render-process-gone', (_e, details) => logError('Interface plantée', details.reason));
  mainWindow.webContents.on('console-message', (e) => {
    if (e.level === 'error') logError('Interface', e.message);
  });

  // Liens externes : toujours dans le navigateur, jamais dans l'appli.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // L'interface tient sur une seule page : toute navigation ailleurs est refusée (un autre
  // fichier local chargé ici aurait accès au pont « sono »).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow.webContents.getURL()) e.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    synth?.dispose(); // les fenêtres invisibles ne doivent pas garder l'appli ouverte
    tagger?.dispose();
  });
}

// ---------------------------------------------------------------------------
// Dialogue avec l'interface (IPC)

function registerIpc() {
  ipcMain.handle('app:init', () => ({
    settings: settings.publicView(),
    sources: describeSources(settings.get()),
    library: { root: library.root, items: library.list() },
    platform: process.platform,
    version: app.getVersion(),
  }));

  // --- Bibliothèque -------------------------------------------------------
  ipcMain.handle('lib:pick', async (_e, mode) => {
    const kinds = Object.values(MEDIA_KINDS).filter((k) => k.enabled);
    const res = await dialog.showOpenDialog(mainWindow, {
      title: mode === 'folder' ? 'Importer un dossier' : 'Importer des fichiers',
      properties: mode === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
      filters: mode === 'folder' ? [] : [{ name: 'Audio', extensions: kinds.flatMap((k) => k.extensions) }],
    });
    return res.canceled ? [] : res.filePaths;
  });

  ipcMain.handle('lib:analyze', (_e, paths) => analyzeFiles(paths.filter((p) => typeof p === 'string'), library));

  ipcMain.handle('lib:import', (_e, entries, opts) => {
    const clean = entries.map((x) => ({
      path: String(x.path),
      name: String(x.name ?? '').slice(0, 200),
      keywords: cleanKeywords(x.keywords),
      category: MEDIA_KINDS.audio.categories[x.category] ? x.category : 'sfx',
    }));
    return importEntries(clean, library, { copy: opts?.copy !== false });
  });

  ipcMain.handle('lib:update', (_e, id, patch) => {
    const p = {};
    if ('keywords' in patch) p.keywords = cleanKeywords(patch.keywords);
    if ('name' in patch) p.name = String(patch.name).slice(0, 200).trim() || library.get(id)?.name;
    if ('category' in patch && MEDIA_KINDS.audio.categories[patch.category]) p.category = patch.category;
    if ('favorite' in patch) p.favorite = Boolean(patch.favorite);
    if ('peaks' in patch && typeof patch.peaks === 'string' && patch.peaks.length <= 400) p.peaks = patch.peaks;
    if ('playCount' in patch) p.playCount = Number(patch.playCount) || 0;
    if ('notes' in patch) p.notes = String(patch.notes).slice(0, 2000);
    return library.update(id, p);
  });

  ipcMain.handle('lib:remove', async (_e, ids, { deleteFiles = true } = {}) => {
    const removed = library.remove(ids);
    let trashed = 0;
    if (deleteFiles) {
      for (const it of removed) {
        const file = library.absPath(it);
        // On ne met à la corbeille que les fichiers rangés par l'appli (dans le dossier actuel
        // ou un ancien dossier de la bibliothèque), jamais les originaux importés « sur place ».
        // Pour un ancien dossier, on exige en plus le rangement de l'appli (Sons/<catégorie>/fichier) :
        // un index modifié à la main ne peut pas faire jeter un fichier quelconque.
        const inOldLibrary = it.managed && /[\\/](Sons|Visuels)[\\/][^\\/]+[\\/][^\\/]+$/.test(file ?? '');
        if (file && (inOldLibrary || isInside(library.root, file)) && fs.existsSync(file)) {
          try {
            await shell.trashItem(file);
            trashed++;
          } catch { /* fichier verrouillé : on laisse */ }
        }
      }
    }
    return { removed: removed.length, trashed };
  });

  ipcMain.handle('lib:reveal', (_e, id) => {
    const file = library.absPath(library.get(id));
    if (file && fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(library.root);
  });

  ipcMain.handle('lib:openRoot', () => shell.openPath(library.root));

  /** Identifiants des sons dont le fichier est introuvable (disque débranché, fichier déplacé…). */
  ipcMain.handle('lib:missing', async () => {
    const lib = library;
    const missing = [];
    await Promise.all(lib.list().map(async (it) => {
      try {
        await fs.promises.access(lib.absPath(it));
      } catch {
        missing.push(it.id);
      }
    }));
    return missing;
  });

  ipcMain.on('lib:startDrag', (e, ids) => {
    const files = ids.map((id) => library.absPath(library.get(id))).filter((f) => f && fs.existsSync(f));
    if (!files.length) return;
    e.sender.startDrag({ file: files[0], files, icon: dragIcon() });
  });

  // --- Recherche en ligne ---------------------------------------------------
  ipcMain.handle('online:search', async (_e, { sourceId, query, page = 1, commercialOnly = false }) => {
    const source = getSource(sourceId);
    const s = settings.get();
    if (!source.isConfigured(s)) return { error: 'Clé API manquante : ajoute-la dans les Réglages.', needsKey: true };
    try {
      const res = await source.search({ query: String(query).slice(0, 200), page, commercialOnly, settings: s });
      res.items.forEach(cacheResult);
      return { ...res, items: res.items.map(publicResult) };
    } catch (err) {
      return { error: err.message, status: err.status ?? null };
    }
  });

  ipcMain.handle('online:resolve', async (_e, key) => {
    const r = resultCache.get(key);
    if (!r) return { error: 'Résultat expiré, relance la recherche.' };
    const source = getSource(r.provider);
    if (!r.needsResolve || !source.resolve) return publicResult(r);
    try {
      const resolved = await source.resolve(r);
      cacheResult(resolved);
      return publicResult(resolved);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('online:download', async (_e, { key, keywords, category, name }) => {
    let r = resultCache.get(key);
    if (!r) return { error: 'Résultat expiré, relance la recherche.' };
    const already = library.findBySource(r.key, r.pageUrl);
    if (already) return { item: already, already: true };
    const source = getSource(r.provider);
    try {
      if (r.needsResolve && source.resolve) {
        r = await source.resolve(r);
        cacheResult(r);
      }
      if (r.downloadable === false) throw new Error("Cette source n'autorise pas le téléchargement de ce son.");
      const plan = await source.download(r, { getAccessToken: () => getFreesoundAccessToken(settings) });
      const item = await downloadToLibrary(
        r,
        plan,
        {
          keywords: cleanKeywords(keywords),
          category: MEDIA_KINDS.audio.categories[category] ? category : 'sfx',
          name: String(name ?? '').slice(0, 200).trim(),
        },
        library,
        { onProgress: (received, total) => send('download:progress', { key, received, total }) },
      );
      return { item };
    } catch (err) {
      return { error: err.message };
    }
  });

  // --- Réglages -------------------------------------------------------------
  ipcMain.handle('settings:update', (_e, patch) => {
    const p = {};
    for (const k of ['copyOnImport', 'commercialOnly', 'translateOnline', 'autoTags']) if (k in patch) p[k] = Boolean(patch[k]);
    if ('volume' in patch) p.volume = Math.min(1, Math.max(0, Number(patch.volume) || 0));
    if (patch.sources) {
      p.sources = {};
      for (const s of SOURCES) if (s.id in patch.sources) p.sources[s.id] = Boolean(patch.sources[s.id]);
    }
    if (patch.freesound) {
      p.freesound = {};
      if (typeof patch.freesound.apiKey === 'string') p.freesound.apiKey = patch.freesound.apiKey.trim();
      if (typeof patch.freesound.clientId === 'string') p.freesound.clientId = patch.freesound.clientId.trim();
    }
    if (patch.jamendo && typeof patch.jamendo.clientId === 'string') {
      p.jamendo = { clientId: patch.jamendo.clientId.trim() };
    }
    settings.update(p);
    tagLibrary(); // au cas où les mots-clés automatiques viennent d'être activés
    return { settings: settings.publicView(), sources: describeSources(settings.get()) };
  });

  ipcMain.handle('settings:pickLibrary', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir le dossier de la bibliothèque',
      defaultPath: library.root,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    // Les sons déjà enregistrés suivent : ils restent où ils sont, avec leur chemin complet.
    // « managed » : fichier rangé par l'appli (et non un original importé sur place).
    const carried = library.list().map((it) => ({ ...it, file: library.absPath(it), managed: it.managed || !path.isAbsolute(it.file) }));
    openLibrary(res.filePaths[0]); // d'abord : si le dossier est inutilisable, les réglages ne changent pas
    library.adopt(carried);
    settings.update({ libraryPath: res.filePaths[0] });
    return { settings: settings.publicView(), library: { root: library.root, items: library.list() } };
  });

  ipcMain.handle('freesound:connect', async () => {
    const s = settings.get();
    try {
      const tokens = await connectFreesound({ clientId: s.freesound.clientId, apiKey: s.freesound.apiKey, parent: mainWindow });
      settings.update({ freesound: { oauth: tokens } });
      return { settings: settings.publicView() };
    } catch (err) {
      return { error: err.message, settings: settings.publicView() };
    }
  });

  ipcMain.handle('freesound:disconnect', () => {
    settings.update({ freesound: { oauth: null } });
    return { settings: settings.publicView() };
  });

  // --- Génération par le code (recettes) -------------------------------------
  const recipesDir = () => path.join(library.root, USER_RECIPES_DIR);
  // Le premier argument d'ipcMain.handle est l'événement : on le saute.
  const safely = (fn) => async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { error: err.message };
    }
  };

  ipcMain.handle('gen:recipes', safely(async () => ({ recipes: await synth.describe(recipesDir()) })));

  ipcMain.handle('gen:render', safely(({ key, values, seed }) =>
    synth.render(recipesDir(), String(key), values ?? {}, Number(seed) >>> 0)));

  ipcMain.handle('gen:test', safely((code) => synth.test(String(code))));

  ipcMain.handle('gen:saveRecipe', safely(async ({ name, code }) => {
    await synth.test(String(code)); // on n'enregistre qu'une recette qui marche
    return { key: synth.saveRecipe(recipesDir(), String(name ?? ''), String(code)) };
  }));

  ipcMain.handle('gen:openRecipes', () => {
    fs.mkdirSync(recipesDir(), { recursive: true });
    return shell.openPath(recipesDir());
  });

  ipcMain.handle('gen:prompt', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'synth', 'consigne-ia.txt'), 'utf8');
    const example = fs.readFileSync(path.join(BUILTIN_DIR, 'whoosh.recette'), 'utf8');
    return template.replace('{EXEMPLE}', example.trim());
  });

  ipcMain.handle('gen:save', safely(async ({ renderId, name, keywords, category }) => {
    const r = synth.getRender(String(renderId));
    if (!r) throw new Error('Son expiré : relance le rendu.');
    const cat = MEDIA_KINDS.audio.categories[category] ? category : r.meta.category;
    const dir = library.folderFor('audio', cat);
    const title = String(name ?? '').slice(0, 200).trim() || r.meta.name;
    const dest = uniquePath(dir, safeFileName(title), 'wav');
    fs.writeFileSync(dest, Buffer.from(r.wav));
    let info;
    try {
      info = await readAudioInfo(dest);
    } catch {
      fs.rmSync(dest, { force: true });
      throw new Error("Le son généré n'est pas un audio valide.");
    }
    const kws = cleanKeywords(keywords);
    return {
      item: library.add({
        kind: 'audio',
        category: cat,
        name: title,
        file: library.storedPath(dest),
        ext: 'wav',
        size: fs.statSync(dest).size,
        duration: info.duration,
        sampleRate: info.sampleRate,
        channels: info.channels,
        keywords: kws,
        tags: r.meta.keywords.filter((k) => !kws.includes(k)),
        hash: await quickHash(dest),
        peaks: encodePeaks(r.peaks),
        source: {
          provider: 'generated',
          providerLabel: 'Généré',
          title: r.meta.name,
          recipe: { key: r.key, name: r.meta.name, values: r.values, seed: r.seed },
          license: describeLicense('generated'),
        },
      }),
    };
  }));

  // --- Découpe rapide : extraits d'un son -------------------------------------
  // L'interface envoie l'extrait (un WAV) dès que le passage est choisi. Il attend dans le dossier
  // temporaire ; il n'est rangé pour de bon que s'il est glissé dans un montage ou ajouté à la
  // bibliothèque, car le logiciel de montage garde un lien vers le fichier déposé.
  const extracts = new Map(); // jeton → { temp, itemId, kept }
  const MAX_EXTRACT_BYTES = 400 * 1024 * 1024;
  const MAX_PENDING_EXTRACTS = 6;

  /** Rangement définitif d'un extrait dans <bibliothèque>/Sons/<catégorie>/. */
  const keepExtract = (x) => {
    if (x.kept && fs.existsSync(x.kept)) return x.kept;
    const item = library.get(x.itemId);
    const dir = library.folderFor('audio', item?.category ?? 'sfx');
    x.kept = uniquePath(dir, safeFileName(`${item?.name ?? 'Son'} (extrait)`), 'wav');
    fs.copyFileSync(x.temp, x.kept);
    return x.kept;
  };

  ipcMain.handle('cut:prepare', safely(async ({ id, bytes }) => {
    const item = library.get(String(id));
    if (!item) throw new Error('Son introuvable dans la bibliothèque.');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44 || bytes.byteLength > MAX_EXTRACT_BYTES
      || Buffer.from(bytes.buffer, bytes.byteOffset, 4).toString('latin1') !== 'RIFF') {
      throw new Error("L'extrait n'est pas un fichier audio valide.");
    }
    const dir = path.join(app.getPath('temp'), 'Sonotheque-extraits');
    fs.mkdirSync(dir, { recursive: true });
    const token = randomUUID();
    const temp = path.join(dir, `${token}.wav`);
    fs.writeFileSync(temp, bytes);
    try {
      await readAudioInfo(temp);
    } catch {
      fs.rmSync(temp, { force: true });
      throw new Error("L'extrait n'est pas un fichier audio valide.");
    }
    extracts.set(token, { temp, itemId: item.id, kept: null });
    while (extracts.size > MAX_PENDING_EXTRACTS) {
      const [old, x] = extracts.entries().next().value;
      fs.rmSync(x.temp, { force: true }); // seulement le brouillon : un extrait déjà rangé reste en place
      extracts.delete(old);
    }
    return { token };
  }));

  ipcMain.on('cut:startDrag', (e, token) => {
    const x = extracts.get(token);
    if (!x || !fs.existsSync(x.temp)) return;
    try {
      const file = keepExtract(x);
      e.sender.startDrag({ file, files: [file], icon: dragIcon() });
    } catch (err) {
      logError("Glisser d'un extrait", err);
    }
  });

  ipcMain.handle('cut:save', safely(async ({ token }) => {
    const x = extracts.get(token);
    if (!x || !fs.existsSync(x.temp)) throw new Error('Extrait expiré : choisis de nouveau le passage.');
    const original = library.get(x.itemId);
    const file = keepExtract(x);
    const existing = library.list().find((it) => library.absPath(it) === file);
    if (existing) return { item: existing }; // déjà ajouté
    const info = await readAudioInfo(file);
    return {
      item: library.add({
        kind: 'audio',
        category: original?.category ?? 'sfx',
        name: path.basename(file, '.wav'),
        file: library.storedPath(file),
        ext: 'wav',
        size: fs.statSync(file).size,
        duration: info.duration,
        sampleRate: info.sampleRate,
        channels: info.channels,
        keywords: original?.keywords ?? [],
        tags: original?.tags ?? [],
        hash: await quickHash(file),
        // Même provenance et même licence que le son d'origine.
        source: { ...(original?.source ?? { provider: 'local', providerLabel: 'Import local', license: describeLicense('own') }), extractOf: original?.name ?? null },
      }),
    };
  }));

  // --- Divers ---------------------------------------------------------------
  ipcMain.handle('shell:open', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return shell.openExternal(url);
    return null;
  });

  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(String(text));
  });
}

// ---------------------------------------------------------------------------
// Démarrage

// Le nom « Sonothèque » (avec accent) se retrouverait dans l'en-tête User-Agent, qui doit
// rester en ASCII : sinon la lecture des fichiers locaux échoue.
app.userAgentFallback = app.userAgentFallback
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, '');

app.whenReady().then(() => {
  if (!isFirstInstance) return;
  try {
    setFetch((url, opts) => net.fetch(url, opts));
    // L'appli n'a besoin d'aucune autorisation web (micro, caméra, position, notifications…).
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));

    const crypto = safeStorage.isEncryptionAvailable()
      ? {
          encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
          decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
        }
      : null;
    const defaultLibraryPath = path.join(app.getPath('music'), 'Sonotheque');
    settings = createSettingsStore({
      file: path.join(app.getPath('userData'), 'reglages.json'),
      defaultLibraryPath,
      crypto,
    });
    if (settings.isNew) {
      // Premier lancement : on demande où ranger la bibliothèque.
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Bienvenue dans la Sonothèque',
        message: 'Où veux-tu ranger ta bibliothèque de sons ?',
        detail: `Tes sons et leurs mots-clés seront enregistrés dans ce dossier.\n\nPar défaut : ${defaultLibraryPath}\n\nTu pourras en changer plus tard dans les Réglages.`,
        buttons: ['Utiliser le dossier par défaut', 'Choisir un autre dossier…'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      const picked = choice === 1
        ? dialog.showOpenDialogSync({ title: 'Choisir le dossier de la bibliothèque', defaultPath: app.getPath('music'), properties: ['openDirectory', 'createDirectory'] })?.[0]
        : null;
      settings.update({ libraryPath: picked ?? defaultLibraryPath }); // enregistre : la question n'est posée qu'une fois
    }
    try {
      openLibrary(settings.get().libraryPath);
    } catch (err) {
      // Bibliothèque sur un disque débranché, par exemple : on ouvre celle par défaut sans
      // toucher aux réglages, pour retrouver la bonne au prochain lancement.
      logError('Bibliothèque inaccessible', err);
      openLibrary(defaultLibraryPath);
      dialog.showMessageBox({
        type: 'warning',
        title: 'Sonothèque',
        message: 'Bibliothèque introuvable',
        detail: `Le dossier ${settings.get().libraryPath} est inaccessible (disque débranché ?).\n\nLa bibliothèque par défaut est ouverte à la place. Rebranche le disque puis relance la Sonothèque pour retrouver tes sons.`,
      });
    }
    synth = createSynth();
    if (taggerAvailable()) {
      soundClasses = readClasses();
      tagger = createTagger();
      tagLibrary();
    }

    protocol.handle(SCHEME, serveLibraryFile);
    if (app.isPackaged) Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();

    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    fatal('Démarrage', err);
  }
});

app.on('before-quit', () => {
  library?.flush();
  synth?.dispose();
  tagger?.dispose();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
