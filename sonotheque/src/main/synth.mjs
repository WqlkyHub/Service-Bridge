// Génération de sons par le code (« recettes »).
// Les recettes s'exécutent dans une fenêtre invisible, isolée (sandbox, sans réseau ni disque),
// dans son propre processus : une recette qui boucle à l'infini ne bloque pas l'appli.

import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeFileName } from './library.mjs';
import { MEDIA_KINDS } from '../shared/media-kinds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTH_HTML = path.join(__dirname, '..', 'synth', 'synth.html');
const SYNTH_PRELOAD = path.join(__dirname, '..', 'synth', 'synth-preload.cjs');
export const BUILTIN_DIR = path.join(__dirname, '..', 'recipes');
export const USER_RECIPES_DIR = 'Recettes';
const RECIPE_EXT = /\.recette(\.txt)?$/i;
const MAX_RECIPE_BYTES = 200 * 1024;
const RENDER_TIMEOUT_MS = 30_000;
const KEPT_RENDERS = 8;

const MAX_WAV_BYTES = 64 * 1024 * 1024; // un rendu de 130 s en stéréo 16 bits pèse ~23 Mo

// La fenêtre de synthèse exécute du code collé par l'utilisateur : ses réponses ne sont pas
// fiables. On ne garde que des valeurs simples, de taille bornée, avant de s'en servir.
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function cleanMeta(m) {
  if (!m || typeof m !== 'object') throw new Error('Réponse invalide du moteur de synthèse.');
  const params = Object.entries(m.params && typeof m.params === 'object' ? m.params : {}).slice(0, 40)
    .filter(([, d]) => d && typeof d === 'object')
    .map(([k, d]) => {
      const label = str(d.label, 60) || k.slice(0, 60);
      if (d.type === 'choice' && Array.isArray(d.options) && d.options.length) {
        const options = d.options.slice(0, 40).map((o) => ({ value: str(o?.value, 60), label: str(o?.label, 60) }));
        return [k, { type: 'choice', label, options, default: str(d.default, 60) }];
      }
      const min = num(d.min, 0);
      const max = Math.max(num(d.max, 1), min);
      return [k, { type: 'range', label, min, max, step: num(d.step, 0.01), unit: str(d.unit, 12), default: Math.min(max, Math.max(min, num(d.default, min))) }];
    });
  return {
    name: str(m.name, 60) || 'Sans nom',
    description: str(m.description, 200),
    category: Object.hasOwn(MEDIA_KINDS.audio.categories, m.category) ? m.category : 'sfx',
    keywords: (Array.isArray(m.keywords) ? m.keywords : []).slice(0, 6).map((k) => str(k, 40)).filter(Boolean),
    params: Object.fromEntries(params),
  };
}

export function cleanRender(out) {
  const wav = out?.wav instanceof ArrayBuffer ? new Uint8Array(out.wav) : ArrayBuffer.isView(out?.wav) ? out.wav : null;
  if (!wav || wav.byteLength < 44 || wav.byteLength > MAX_WAV_BYTES
    || Buffer.from(wav.buffer, wav.byteOffset, 4).toString('latin1') !== 'RIFF') {
    throw new Error('Le moteur de synthèse a renvoyé un son invalide.');
  }
  return {
    wav: out.wav,
    meta: cleanMeta(out.meta),
    peaks: (Array.isArray(out.peaks) ? out.peaks : []).slice(0, 200).map((p) => Math.min(1, Math.max(0, num(p, 0)))),
    duration: Math.max(0, num(out.duration, 0)),
  };
}

/** Liste les fichiers de recettes (intégrées + celles de l'utilisateur). */
export function listRecipeFiles(userDir) {
  const out = [];
  const read = (dir, builtIn) => {
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => RECIPE_EXT.test(f)).sort((a, b) => a.localeCompare(b, 'fr'));
    } catch {
      return;
    }
    for (const f of files) {
      const file = path.join(dir, f);
      try {
        if (fs.statSync(file).size > MAX_RECIPE_BYTES) continue;
        out.push({ key: `${builtIn ? 'builtin' : 'user'}:${f}`, file, builtIn, code: fs.readFileSync(file, 'utf8') });
      } catch { /* fichier illisible : ignoré */ }
    }
  };
  read(BUILTIN_DIR, true);
  if (userDir) read(userDir, false);
  return out;
}

export function createSynth() {
  let win = null;
  let ready = null;
  let seq = 0;
  const pending = new Map();
  const renders = new Map(); // renderId -> { wav, meta, key, values, seed, duration, peaks }

  function ensureWindow() {
    if (win && !win.isDestroyed()) return ready;
    win = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      webPreferences: {
        preload: SYNTH_PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        partition: 'synth', // session séparée de l'appli
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
      // Aucune requête réseau depuis la fenêtre de synthèse.
      cb({ cancel: !details.url.startsWith('file://') && !details.url.startsWith('devtools://') });
    });
    ready = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.on('closed', () => {
      win = null;
      for (const [, p] of pending) p.reject(new Error('Le moteur de synthèse a été redémarré.'));
      pending.clear();
    });
    win.loadFile(SYNTH_HTML);
    return ready;
  }

  ipcMain.on('synth:reply', (e, msg) => {
    if (!win || e.sender !== win.webContents) return;
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error || 'Erreur dans la recette.'));
  });

  async function call(payload) {
    await ensureWindow();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('La recette a mis trop de temps (boucle infinie ?). Le moteur a été relancé.'));
        win?.destroy();
      }, RENDER_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      win.webContents.send('synth:request', { id, ...payload });
    });
  }

  return {
    /** Décrit toutes les recettes : nom, paramètres… ou l'erreur si le fichier est invalide. */
    async describe(userDir) {
      const files = listRecipeFiles(userDir);
      if (!files.length) return [];
      const res = await call({ type: 'describe', items: files.map(({ key, code }) => ({ key, code })) });
      const results = Array.isArray(res.results) ? res.results : [];
      return files.map((f) => {
        const r = results.find((x) => x?.key === f.key) ?? {};
        const base = { key: f.key, builtIn: f.builtIn, file: path.basename(f.file) };
        try {
          if (r.error || !r.meta) return { ...base, meta: null, error: str(r.error, 500) || 'Recette illisible.' };
          return { ...base, meta: cleanMeta(r.meta), error: null };
        } catch (err) {
          return { ...base, meta: null, error: err.message };
        }
      });
    },

    /** Teste un code de recette collé par l'utilisateur, sans l'enregistrer. */
    async test(code) {
      const key = `test:${randomUUID()}`;
      const res = await call({ type: 'describe', items: [{ key, code }] });
      const r = res.results?.[0];
      if (!r || r.error) throw new Error(str(r?.error, 500) || 'Recette illisible.');
      const out = await call({ type: 'render', key, code, values: {}, seed: 1 });
      return this.keep(out, { key, code, values: {}, seed: 1 });
    },

    async render(userDir, key, values, seed) {
      const f = listRecipeFiles(userDir).find((x) => x.key === key);
      if (!f) throw new Error('Recette introuvable (fichier supprimé ?).');
      const out = await call({ type: 'render', key, code: f.code, values, seed });
      return this.keep(out, { key, values, seed });
    },

    /** Garde le rendu côté principal ; l'interface ne reçoit qu'un identifiant + l'aperçu. */
    keep(out, info) {
      const clean = cleanRender(out);
      const renderId = randomUUID();
      renders.set(renderId, { ...clean, ...info });
      while (renders.size > KEPT_RENDERS) renders.delete(renders.keys().next().value);
      return { renderId, ...clean };
    },

    getRender(renderId) {
      return renders.get(renderId) ?? null;
    },

    /** Enregistre une recette collée dans le dossier « Recettes » de la bibliothèque. */
    saveRecipe(userDir, name, code) {
      if (Buffer.byteLength(code, 'utf8') > MAX_RECIPE_BYTES) throw new Error('Recette trop longue.');
      fs.mkdirSync(userDir, { recursive: true });
      let base = safeFileName(name, 'ma-recette');
      let file = path.join(userDir, `${base}.recette`);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(userDir, `${base} (${i}).recette`);
      fs.writeFileSync(file, code, 'utf8');
      return `user:${path.basename(file)}`;
    },

    dispose() {
      win?.destroy();
    },
  };
}
