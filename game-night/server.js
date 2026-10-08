#!/usr/bin/env node
/**
 * La Manette d'Or — serveur de soirée en réseau local.
 *
 *   node server.js            (puis chacun ouvre l'adresse affichée)
 *   PORT=3000 node server.js
 *
 * Aucune dépendance : sert l'app et synchronise tous les appareils du
 * même Wi-Fi par Server-Sent Events. L'état est sauvegardé dans soiree.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA = path.join(ROOT, 'soiree.json');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/json; charset=utf-8'],
  '/service-worker.js': ['service-worker.js', 'text/javascript; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml']
};
const COLLECTIONS = ['players', 'challenges', 'events'];

// Mise à jour automatique : au démarrage (et sur demande depuis l'app), le
// serveur récupère la dernière version des fichiers depuis GitHub. Rien à
// retélécharger à la main. NO_UPDATE=1 pour la désactiver.
const REMOTE = 'https://raw.githubusercontent.com/WqlkyHub/Service-Bridge/'
  + 'refs/heads/claude/video-game-challenge-tracker-hlx0yq/game-night/';
const UPDATABLE = [
  { name: 'index.html', min: 20000, must: "La Manette d'Or" },
  { name: 'manifest.json', min: 200, must: 'short_name' },
  { name: 'service-worker.js', min: 300, must: 'CACHE_NAME' },
  { name: 'icon.svg', min: 100, must: '<svg' },
  { name: 'soiree-depart.json', min: 200, must: 'challenges' },
  { name: 'server.js', min: 3000, must: 'createServer' },
  { name: 'demarrer-windows.bat', min: 100, must: 'node server.js' },
  { name: 'demarrer-mac-linux.command', min: 100, must: 'node server.js' }
];
const MAX_BODY = 2 * 1024 * 1024;
const MAX_EVENTS = 2000;   // le journal d'une soirée reste borné
const UPDATE_EVERY = Number(process.env.UPDATE_MS || 10 * 60 * 1000);   // vérification périodique des nouvelles versions

let state = load();
let rev = 0;
let saveTimer = null;
const clients = new Set();

function empty() {
  return {
    meta: { name: "La Manette d'Or", date: new Date().toISOString().slice(0, 10), cats: null },
    players: [], challenges: [], events: []
  };
}
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (d && Array.isArray(d.players)) return d;
  } catch (e) {}
  return empty();
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA, JSON.stringify(state), err => {
      if (err) console.error('Sauvegarde impossible :', err.message);
    });
  }, 250);
}
function send(event, data) {
  const chunk = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const c of clients) { try { c.write(chunk); } catch (e) {} }
}
function pushState() { rev++; send('state', { rev, state }); save(); }
function pushPeers() { send('peers', { peers: clients.size }); }

function applyOne(op) {
  if (!op || typeof op !== 'object') return false;
  if (op.op === 'put' && COLLECTIONS.includes(op.coll) && op.obj && typeof op.obj.id === 'string') {
    const list = state[op.coll];
    const i = list.findIndex(x => x.id === op.obj.id);
    if (i >= 0) list[i] = op.obj; else list.push(op.obj);
  } else if (op.op === 'drop' && COLLECTIONS.includes(op.coll) && typeof op.id === 'string') {
    state[op.coll] = state[op.coll].filter(x => x.id !== op.id);
  } else if (op.op === 'meta' && op.meta && typeof op.meta === 'object') {
    state.meta = op.meta;
  } else if (op.op === 'replace' && op.state && Array.isArray(op.state.players)) {
    state = op.state;
  } else {
    return false;
  }
  return true;
}

// Un lot entier ne provoque qu'une seule diffusion : charger un pack de 20 défis
// ne réveille pas vingt fois tous les téléphones.
function apply(op) {
  let changed = false;
  if (op && op.op === 'batch' && Array.isArray(op.ops)) {
    for (const sub of op.ops.slice(0, 1000)) changed = applyOne(sub) || changed;
  } else {
    changed = applyOne(op);
  }
  if (!changed) return false;
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
  pushState();
  return true;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function selfUpdate() {
  const out = { updated: [], failed: 0, offline: false, restart: false };
  if (process.env.NO_UPDATE || typeof fetch !== 'function') return out;
  await Promise.all(UPDATABLE.map(async file => {
    try {
      const text = await fetchText(REMOTE + file.name);
      // Un fichier trop court ou sans son marqueur = page d'erreur ou coupure :
      // on garde la version locale plutôt que d'écrire n'importe quoi.
      if (text.length < file.min || text.indexOf(file.must) < 0) throw new Error('contenu inattendu');
      const dest = path.join(ROOT, file.name);
      let current = '';
      try { current = fs.readFileSync(dest, 'utf8'); } catch (e) {}
      if (current === text) return;
      fs.writeFileSync(dest, text);
      if (file.name === 'demarrer-mac-linux.command') { try { fs.chmodSync(dest, 0o755); } catch (e) {} }
      out.updated.push(file.name);
      if (file.name === 'server.js') out.restart = true;
    } catch (e) {
      out.failed++;
    }
  }));
  out.offline = out.failed === UPDATABLE.length;
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > MAX_BODY) { reject(new Error('corps trop volumineux')); req.destroy(); }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ rev, state, peers: clients.size }));
  }

  if (url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    res.write('retry: 2000\n\n');
    clients.add(res);
    res.write('event: state\ndata: ' + JSON.stringify({ rev, state }) + '\n\n');
    pushPeers();
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); pushPeers(); });
    return;
  }

  if (url === '/api/update' && req.method === 'POST') {
    const result = await selfUpdate();
    if (result.updated.length) send('version', { updated: result.updated, restart: result.restart });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (url === '/api/op' && req.method === 'POST') {
    try {
      const ok = apply(JSON.parse(await readBody(req)));
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok, rev }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  const hit = STATIC[url];
  if (hit && (req.method === 'GET' || req.method === 'HEAD')) {
    return fs.readFile(path.join(ROOT, hit[0]), (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Fichier introuvable'); }
      res.writeHead(200, { 'Content-Type': hit[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Page introuvable');
});

function addresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function flush() {
  clearTimeout(saveTimer);
  try { fs.writeFileSync(DATA, JSON.stringify(state)); } catch (e) {}
}
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  Le port ' + PORT + ' est déjà utilisé. Essayez : PORT=8081 node server.js\n');
    process.exit(1);
  }
  throw err;
});

async function start() {
  console.log('\n  La Manette d\'Or — recherche d\'une mise à jour…');
  const up = await selfUpdate();
  if (up.offline) console.log('  Pas de connexion à GitHub : version locale conservée.');
  else if (up.updated.length) console.log('  Mis à jour : ' + up.updated.join(', '));
  else console.log('  Déjà à jour.');
  if (up.restart) console.log('  ⚠ Le serveur lui-même a été mis à jour : fermez et relancez pour en profiter.');

  // Une nouvelle version publiée arrive toute seule sur les appareils ouverts.
  setInterval(async () => {
    try {
      const up = await selfUpdate();
      if (up.updated.length) {
        console.log('  Mise à jour installée : ' + up.updated.join(', '));
        send('version', { updated: up.updated, restart: up.restart });
      }
    } catch (e) {}
  }, UPDATE_EVERY);

  server.listen(PORT, () => {
    const lines = addresses().map(ip => '  http://' + ip + ':' + PORT + '   (les autres appareils)');
    let v = 'inconnue';
    try {
      const m = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/var VERSION = '([^']+)'/);
      if (m) v = m[1];
    } catch (e) {}
    console.log('\n  Serveur de soirée prêt — app version ' + v + '\n');
    console.log('  http://localhost:' + PORT + '   (cet ordinateur)');
    lines.forEach(l => console.log(l));
    console.log('\n  Données : ' + DATA);
    console.log('  Ctrl+C pour arrêter.\n');
  });
}

start();
