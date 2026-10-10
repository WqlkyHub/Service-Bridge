// Mots-clés automatiques : une fenêtre invisible et isolée (sandbox, sans réseau ni disque)
// écoute chaque son avec un modèle de reconnaissance et dit ce qu'elle y entend.
// Le modèle est téléchargé à l'installation (outils/telecharger-ia.cjs) ; s'il manque,
// l'appli fonctionne sans cette fonction.

import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IA_DIR = path.join(__dirname, '..', 'ia');
const MODEL_DIR = path.join(IA_DIR, 'modele');
const TIMEOUT_MS = 60_000;

export function taggerAvailable() {
  return ['tf.min.js', 'model.json', 'classes.csv'].every((f) => fs.existsSync(path.join(MODEL_DIR, f)));
}

/** Noms des 521 catégories, dans l'ordre des scores renvoyés par le modèle. */
export function readClasses() {
  return fs.readFileSync(path.join(MODEL_DIR, 'classes.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
    .map((line) => line.replace(/^\d+,[^,]+,/, '').replace(/^"|"$/g, ''));
}

/** Le modèle, sous la forme attendue par TensorFlow.js : structure + poids en un seul bloc. */
function readModel() {
  const json = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'model.json'), 'utf8'));
  const weights = Buffer.concat(json.weightsManifest.flatMap((g) => g.paths).map((p) => fs.readFileSync(path.join(MODEL_DIR, path.basename(p)))));
  return {
    modelTopology: json.modelTopology,
    format: json.format,
    generatedBy: json.generatedBy,
    convertedBy: json.convertedBy,
    signature: json.signature,
    weightSpecs: json.weightsManifest.flatMap((g) => g.weights),
    weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
  };
}

export function createTagger() {
  let win = null;
  let ready = null; // fenêtre chargée ET modèle en place
  let seq = 0;
  let disposed = false;
  const pending = new Map();

  ipcMain.on('ia:reply', (e, msg) => {
    if (!win || e.sender !== win.webContents) return;
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) return p.resolve(msg);
    // Le moteur a répondu qu'il ne sait pas lire ce son : inutile de réessayer celui-là.
    p.reject(Object.assign(new Error(String(msg.error || 'Analyse impossible.').slice(0, 300)), { unreadable: true }));
  });

  function call(payload) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Analyse trop longue.'));
        win?.destroy(); // moteur bloqué : il sera relancé au prochain son
      }, TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      win.webContents.send('ia:request', { id, ...payload });
    });
  }

  function ensureWindow() {
    if (disposed) throw new Error('Moteur de reconnaissance arrêté.'); // ne pas rouvrir de fenêtre pendant la fermeture
    if (win && !win.isDestroyed()) return ready;
    win = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      webPreferences: {
        preload: path.join(IA_DIR, 'ia-preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        partition: 'ia', // session séparée de l'appli
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
      // Aucune requête réseau depuis cette fenêtre : tes sons ne sortent pas du PC.
      cb({ cancel: !details.url.startsWith('file://') && !details.url.startsWith('devtools://') });
    });
    win.on('closed', () => {
      win = null;
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Le moteur de reconnaissance a été redémarré.'));
      }
      pending.clear();
    });
    ready = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
      .then(() => call({ type: 'init', artifacts: readModel() }));
    win.loadFile(path.join(IA_DIR, 'ia.html'));
    return ready;
  }

  return {
    /**
     * Écoute un fichier audio : un score (0 à 1) par catégorie, et l'« empreinte » du son
     * (1024 nombres) qui sert à comparer deux sons entre eux.
     * @param {Buffer} bytes contenu du fichier
     */
    async analyze(bytes) {
      await ensureWindow();
      const { scores, embedding } = await call({ type: 'tag', bytes });
      // Réponse d'une fenêtre qui décode des fichiers venus d'ailleurs : on ne garde que des nombres.
      if (!Array.isArray(scores) || !Array.isArray(embedding) || embedding.length !== 1024) throw new Error('Réponse invalide du moteur de reconnaissance.');
      const num = (v) => (Number.isFinite(v) ? v : 0);
      return { scores: scores.map((s) => Math.min(1, Math.max(0, num(s)))), embedding: embedding.map(num) };
    },
    dispose() {
      disposed = true;
      win?.destroy();
    },
  };
}
