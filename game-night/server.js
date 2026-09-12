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
const MAX_BODY = 2 * 1024 * 1024;
const MAX_EVENTS = 2000;   // le journal d'une soirée reste borné

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

server.listen(PORT, () => {
  const lines = addresses().map(ip => '  http://' + ip + ':' + PORT + '   (les autres appareils)');
  console.log('\n  La Manette d\'Or — serveur de soirée\n');
  console.log('  http://localhost:' + PORT + '   (cet ordinateur)');
  lines.forEach(l => console.log(l));
  console.log('\n  Données : ' + DATA);
  console.log('  Ctrl+C pour arrêter.\n');
});
