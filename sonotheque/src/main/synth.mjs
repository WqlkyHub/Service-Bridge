// Génération de sons par le code (« recettes »).
// Les recettes s'exécutent dans une fenêtre invisible, isolée (sandbox, sans réseau ni disque),
// dans son propre processus : une recette qui boucle à l'infini ne bloque pas l'appli.

import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeFileName } from './library.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTH_HTML = path.join(__dirname, '..', 'synth', 'synth.html');
const SYNTH_PRELOAD = path.join(__dirname, '..', 'synth', 'synth-preload.cjs');
export const BUILTIN_DIR = path.join(__dirname, '..', 'recipes');
export const USER_RECIPES_DIR = 'Recettes';
const RECIPE_EXT = /\.recette(\.txt)?$/i;
const MAX_RECIPE_BYTES = 200 * 1024;
const RENDER_TIMEOUT_MS = 30_000;
const KEPT_RENDERS = 8;

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
      return files.map((f) => {
        const r = res.results.find((x) => x.key === f.key) ?? {};
        return { key: f.key, builtIn: f.builtIn, file: path.basename(f.file), meta: r.meta ?? null, error: r.error ?? null };
      });
    },

    /** Teste un code de recette collé par l'utilisateur, sans l'enregistrer. */
    async test(code) {
      const key = `test:${randomUUID()}`;
      const res = await call({ type: 'describe', items: [{ key, code }] });
      const r = res.results[0];
      if (r.error) throw new Error(r.error);
      const out = await call({ type: 'render', key, code, values: {}, seed: 1 });
      return { meta: r.meta, ...this.keep(out, { key, code, values: {}, seed: 1 }) };
    },

    async render(userDir, key, values, seed) {
      const f = listRecipeFiles(userDir).find((x) => x.key === key);
      if (!f) throw new Error('Recette introuvable (fichier supprimé ?).');
      const out = await call({ type: 'render', key, code: f.code, values, seed });
      return this.keep(out, { key, values, seed });
    },

    /** Garde le rendu côté principal ; l'interface ne reçoit qu'un identifiant + l'aperçu. */
    keep(out, info) {
      const renderId = randomUUID();
      renders.set(renderId, { wav: out.wav, meta: out.meta, peaks: out.peaks, duration: out.duration, ...info });
      while (renders.size > KEPT_RENDERS) renders.delete(renders.keys().next().value);
      return { renderId, wav: out.wav, peaks: out.peaks, duration: out.duration, meta: out.meta };
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
