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

/**
 * Dessine une forme d'onde en barres symétriques.
 * @param progress 0..1 : partie déjà lue (colorée différemment)
 */
export function drawPeaks(canvas, peaks, { progress = 0, color = '#5a5f78', playedColor = '#a78bfa' } = {}) {
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
  const mid = hgt / 2;
  if (!peaks?.length) {
    g.fillStyle = color;
    g.fillRect(0, mid - 0.5, w, 1);
    if (progress > 0) {
      g.fillStyle = playedColor;
      g.fillRect(0, mid - 1, w * progress, 2);
    }
    return;
  }
  const bars = Math.min(peaks.length, Math.floor(w / 2));
  const barW = w / bars;
  for (let i = 0; i < bars; i++) {
    const p = peaks[Math.floor((i / bars) * peaks.length)];
    const bh = Math.max(1, p * (hgt - 2));
    g.fillStyle = (i + 0.5) / bars <= progress ? playedColor : color;
    g.fillRect(i * barW, mid - bh / 2, Math.max(1, barW - 1), bh);
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
