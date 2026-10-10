// Formes d'onde : calcul (une seule fois par son, mémorisé dans la bibliothèque) et dessin.

import { isPlayable } from '../../shared/media-kinds.mjs';
import { encodePeaks, decodePeaks } from '../../shared/peaks.mjs';

export const PEAK_COUNT = 100;
const MAX_DECODE_BYTES = 80 * 1024 * 1024;
export { encodePeaks, decodePeaks };

/** Calcule les pics d'un fichier audio (ArrayBuffer). */
export async function computePeaks(arrayBuffer, count = PEAK_COUNT) {
  const ctx = new OfflineAudioContext(1, 1, 22050);
  const audio = await ctx.decodeAudioData(arrayBuffer);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const len = audio.length;
  const bucket = Math.max(1, Math.floor(len / count));
  const peaks = new Array(count).fill(0);
  for (let b = 0; b < count; b++) {
    const start = b * bucket;
    const end = Math.min(len, start + bucket);
    let max = 0;
    // On échantillonne au maximum ~2000 points par case pour rester rapide sur les sons longs.
    const step = Math.max(1, Math.floor((end - start) / 2000));
    for (const data of channels) {
      for (let i = start; i < end; i += step) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
    }
    peaks[b] = max;
  }
  const top = Math.max(...peaks, 0.0001);
  return peaks.map((p) => Math.max(0.04, p / top));
}

/** Réduit une série à `count` valeurs (le maximum de chaque tranche). */
function resample(values, count) {
  const n = Math.max(2, Math.min(values.length, count));
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * values.length) / n);
    return Math.max(...values.slice(a, Math.max(a + 1, Math.floor(((i + 1) * values.length) / n))));
  });
}

/** Trace une crête lissée, posée sur la ligne de base, et la remplit. */
function fillRidge(g, values, w, base, height) {
  const n = values.length;
  const x = (i) => (i / (n - 1)) * w;
  const y = (i) => base - values[i] * height;
  g.beginPath();
  g.moveTo(0, base);
  g.lineTo(0, y(0));
  for (let i = 1; i < n; i++) g.quadraticCurveTo(x(i - 1), y(i - 1), (x(i - 1) + x(i)) / 2, (y(i - 1) + y(i)) / 2);
  g.lineTo(w, y(n - 1));
  g.lineTo(w, base);
  g.closePath();
  g.fill();
}

/**
 * Dessine un son comme un paysage : deux lignes de crêtes superposées, dans la couleur de la
 * catégorie (variable CSS --cat de l'élément).
 * @param progress 0..1 : partie déjà lue (en couleur pleine)
 * @param dot      affiche la tête de lecture, un point posé au-dessus de la crête
 */
export function drawPeaks(canvas, peaks, { progress = 0, dot = false } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w || !hgt) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  g.fillStyle = getComputedStyle(canvas).getPropertyValue('--cat').trim() || '#24707a';
  const base = hgt;
  const height = dot ? hgt - 16 : hgt - 2; // place pour la tête de lecture au-dessus des crêtes
  if (!peaks?.length) {
    g.globalAlpha = 0.3;
    g.fillRect(0, base - 2, w, 2);
    g.globalAlpha = 1;
    if (progress > 0) g.fillRect(0, base - 2, w * progress, 2);
    return;
  }
  // La crête du fond, plus haute et plus douce, donne la profondeur.
  const back = resample(peaks, Math.round(w / 12));
  const front = resample(peaks, Math.round(w / 5)).map((p) => p * 0.7);
  g.globalAlpha = 0.24;
  fillRidge(g, back, w, base, height);
  g.globalAlpha = 0.5;
  fillRidge(g, front, w, base, height);
  if (progress > 0) {
    g.save();
    g.beginPath();
    g.rect(0, 0, w * progress, hgt);
    g.clip();
    g.globalAlpha = 1;
    fillRidge(g, front, w, base, height);
    g.restore();
  }
  if (dot) {
    const x = Math.max(7, Math.min(w - 7, w * progress));
    const y = base - front[Math.min(front.length - 1, Math.round(progress * (front.length - 1)))] * height - 9;
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

// Les cordes du lecteur, de la plus grave (épaisse, une seule ondulation) à la plus aiguë.
const STRINGS = [
  { waves: 1, width: 2.6, speed: 9 },
  { waves: 2, width: 2, speed: 13 },
  { waves: 3, width: 1.5, speed: 17 },
  { waves: 5, width: 1, speed: 23 },
];

/**
 * Dessine le lecteur comme un instrument à cordes.
 * @param progress 0..1 : partie déjà lue (cordes en couleur pleine)
 * @param level    0..1 : niveau du son, qui règle l'ampleur de la vibration
 * @param time     secondes : fait osciller les cordes
 * @param head     affiche la tête de lecture, une barrette posée sur les cordes
 */
export function drawStrings(canvas, { progress = 0, level = 0, time = 0, head = false } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w || !hgt) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  const styles = getComputedStyle(canvas);
  g.strokeStyle = styles.getPropertyValue('--cat').trim() || '#24707a';
  g.lineCap = 'round';
  const gap = hgt / (STRINGS.length + 1);
  const strings = () => STRINGS.forEach((s, i) => {
    const y = gap * (i + 1);
    const amp = level * gap * 0.95 * Math.cos(time * s.speed + i);
    g.lineWidth = s.width;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 6; x <= w; x += 6) g.lineTo(x, y + amp * Math.sin((s.waves * Math.PI * x) / w));
    g.lineTo(w, y);
    g.stroke();
  });
  g.globalAlpha = 0.32;
  strings();
  g.globalAlpha = 1;
  if (progress > 0) {
    g.save();
    g.beginPath();
    g.rect(0, 0, w * progress, hgt);
    g.clip();
    strings();
    g.restore();
  }
  if (head) {
    g.fillStyle = styles.getPropertyValue('--ink').trim() || '#1d2a2d';
    g.beginPath();
    g.roundRect(Math.max(0, Math.min(w - 3, w * progress - 1.5)), gap * 0.45, 3, hgt - gap * 0.9, 1.5);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// File d'attente en arrière-plan : calcule les formes d'onde manquantes, un son à la fois.

const queue = [];
const failed = new Set();
let running = false;

export function queuePeaks(items) {
  for (const it of items) {
    if (it.peaks || failed.has(it.id) || queue.includes(it.id)) continue;
    if (!isPlayable(it.kind, it.ext) || (it.size && it.size > MAX_DECODE_BYTES)) continue;
    queue.push(it.id);
  }
  if (!running) run();
}

async function run() {
  running = true;
  while (queue.length) {
    const id = queue.shift();
    try {
      const res = await fetch(window.sono.library.fileUrl(id));
      if (!res.ok) throw new Error('introuvable');
      const peaks = await computePeaks(await res.arrayBuffer());
      await window.sono.library.update(id, { peaks: encodePeaks(peaks) });
    } catch {
      failed.add(id);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  running = false;
}
