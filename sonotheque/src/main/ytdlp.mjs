// yt-dlp : l'outil qui lit YouTube. Il n'est pas livré avec l'appli : il est téléchargé à la
// première utilisation depuis sa page GitHub officielle (empreinte SHA-256 vérifiée), dans le
// dossier de données. YouTube change souvent : quand une commande échoue et que l'outil a plus
// d'un jour, on reprend la dernière version et on réessaie une fois.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { getFetch, USER_AGENT } from './http.mjs';

const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const ASSET = { win32: 'yt-dlp.exe', darwin: 'yt-dlp_macos', linux: 'yt-dlp_linux' }[process.platform];
const ONE_DAY_MS = 24 * 3600 * 1000;

let dir = null;
let ready = null;

/** Dossier où ranger l'outil (appelé au démarrage de l'appli). */
export function setToolsDir(d) {
  dir = d;
}

async function get(url) {
  const res = await getFetch()(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!res.ok) throw new Error(`erreur ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function install(file) {
  if (!ASSET || !dir) throw new Error("YouTube n'est pas disponible sur ce système.");
  try {
    const [sums, bin] = await Promise.all([get(`${RELEASE}/SHA2-256SUMS`), get(`${RELEASE}/${ASSET}`)]);
    const expected = sums.toString('utf8').split('\n').map((l) => l.trim().split(/\s+/)).find((l) => l[1] === ASSET)?.[0];
    if (!expected || createHash('sha256').update(bin).digest('hex') !== expected) throw new Error('empreinte incorrecte');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, bin, { mode: 0o755 });
    fs.renameSync(`${file}.tmp`, file);
  } catch (err) {
    throw new Error(`Impossible d'installer l'outil YouTube (${err.message}). Vérifie ta connexion internet.`);
  }
}

function ensure({ refresh = false } = {}) {
  const file = path.join(dir ?? '', ASSET ?? 'yt-dlp');
  if (refresh || !ready) {
    ready = (refresh || !fs.existsSync(file) ? install(file) : Promise.resolve()).then(() => file);
    ready.catch(() => { ready = null; });
  }
  return ready;
}

function exec(file, args, { timeoutMs, onLine }) {
  return new Promise((resolve, reject) => {
    if (!onLine) {
      execFile(file, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(lastError(stderr) || err.message)) : resolve(stdout)));
      return;
    }
    const child = spawn(file, args, { windowsHide: true });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    let rest = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      const lines = (rest + d).split(/\r?\n/);
      rest = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve('');
      else reject(new Error(lastError(stderr) || 'yt-dlp a été interrompu.'));
    });
  });
}

function lastError(stderr) {
  return String(stderr).split(/\r?\n/).filter((l) => l.startsWith('ERROR:')).pop()?.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') ?? '';
}

/**
 * Lance yt-dlp et renvoie sa sortie.
 * @param onLine appelée pour chaque ligne de sortie (pour suivre un téléchargement)
 */
export async function ytdlp(args, { timeoutMs = 40_000, onLine } = {}) {
  const file = await ensure();
  const base = ['--ignore-config', '--no-warnings', '--no-playlist', ...args];
  try {
    return await exec(file, base, { timeoutMs, onLine });
  } catch (err) {
    if (Date.now() - fs.statSync(file).mtimeMs < ONE_DAY_MS) throw err;
    return exec(await ensure({ refresh: true }), base, { timeoutMs, onLine });
  }
}
