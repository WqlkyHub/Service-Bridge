// Découpe rapide : choisir un passage d'un son sur son tracé, l'écouter en boucle, puis le
// glisser seul dans la timeline ou l'ajouter à la bibliothèque comme nouveau son.

import { h, formatDurationShort, debounce } from './dom.mjs';
import { openModal } from './modal.mjs';
import { drawPeaks } from './waveform.mjs';
import { icon } from './icons.mjs';
import { toast } from './toast.mjs';

const sono = window.sono;
const MAX_BYTES = 80 * 1024 * 1024;
const MIN_SECONDS = 0.05;
const PEAKS = 500;

/** Pics (0..1) d'un son décodé, tous canaux confondus. */
function peaksOf(audio) {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const bucket = Math.max(1, Math.floor(audio.length / PEAKS));
  const out = [];
  for (let b = 0; b * bucket < audio.length && b < PEAKS; b++) {
    let max = 0;
    for (const data of channels) {
      for (let i = b * bucket; i < Math.min(audio.length, (b + 1) * bucket); i += Math.max(1, Math.floor(bucket / 400))) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
    }
    out.push(max);
  }
  const top = Math.max(...out, 0.0001);
  return out.map((p) => Math.max(0.03, p / top));
}

/** Extrait [from, to[ (en échantillons) → fichier WAV 16 bits, avec un fondu de 2 ms à chaque bout. */
function encodeWav(audio, from, to) {
  const n = to - from;
  const chans = audio.numberOfChannels;
  const view = new DataView(new ArrayBuffer(44 + n * chans * 2));
  const text = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + n * chans * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, chans, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, n * chans * 2, true);
  const fade = Math.min(Math.floor(n / 2), Math.round(audio.sampleRate * 0.002));
  for (let c = 0; c < chans; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const edge = Math.min(i, n - 1 - i);
      const s = Math.max(-1, Math.min(1, data[from + i])) * (edge < fade ? edge / fade : 1);
      view.setInt16(44 + (i * chans + c) * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Uint8Array(view.buffer);
}

export async function cutDialog(item, { player }) {
  player.stop();
  const canvas = h('canvas', { class: 'cut-wave' });
  const sel = h('div', { class: 'cut-sel', hidden: true });
  const stage = h('div', { class: ['cut-stage', `cat-${item.category}`] }, canvas, sel);
  const status = h('span', { class: 'gen-status' }, 'Chargement du son…');
  const handle = h('div', {
    class: 'btn btn-primary cut-drag', draggable: 'true', 'aria-disabled': 'true',
    title: 'Glisse ce bouton dans Premiere Pro ou DaVinci Resolve : seul le passage choisi est déposé',
  }, icon('download', { size: 16 }), "Glisser l'extrait dans le montage");

  let audio = null; // son décodé
  let range = null; // [début, fin] en secondes
  let token = null; // extrait prêt côté processus principal
  let preparing = 0;
  let ctx = null;
  let source = null;

  const stopPreview = () => {
    try { source?.stop(); } catch { /* déjà arrêté */ }
    source = null;
  };
  const preview = () => {
    if (!audio || !range) return;
    if (source) return stopPreview();
    ctx ??= new AudioContext();
    source = ctx.createBufferSource();
    source.buffer = audio;
    source.loop = true;
    source.loopStart = range[0];
    source.loopEnd = range[1];
    source.connect(ctx.destination);
    source.start(0, range[0]);
  };

  // L'extrait est fabriqué dès que la sélection est posée : le glisser peut alors partir tout de suite.
  const prepare = async () => {
    const mine = ++preparing;
    token = null;
    handle.setAttribute('aria-disabled', 'true');
    if (!audio || !range) return null;
    const bytes = encodeWav(audio, Math.floor(range[0] * audio.sampleRate), Math.min(audio.length, Math.ceil(range[1] * audio.sampleRate)));
    const res = await sono.library.cut.prepare({ id: item.id, bytes });
    if (mine !== preparing) return null; // la sélection a changé entre-temps
    if (res.error) {
      status.textContent = res.error;
      return null;
    }
    token = res.token;
    handle.setAttribute('aria-disabled', 'false');
    return token;
  };
  const prepareSoon = debounce(prepare, 250);

  const render = () => {
    sel.hidden = !range;
    if (!audio) return;
    if (!range) {
      status.textContent = `${formatDurationShort(audio.duration)} au total. Fais glisser la souris sur le tracé pour choisir un passage.`;
      return;
    }
    sel.style.left = `${(range[0] / audio.duration) * 100}%`;
    sel.style.width = `${((range[1] - range[0]) / audio.duration) * 100}%`;
    status.textContent = `Extrait de ${formatDurationShort(range[1] - range[0])} (de ${formatDurationShort(range[0])} à ${formatDurationShort(range[1])})`;
  };

  // Sélection à la souris sur le tracé.
  let anchor = null;
  const timeAt = (e) => {
    const r = stage.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * audio.duration;
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!audio || e.button !== 0) return;
    stopPreview();
    anchor = timeAt(e);
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (anchor === null) return;
    const t = timeAt(e);
    range = Math.abs(t - anchor) >= MIN_SECONDS ? [Math.min(anchor, t), Math.max(anchor, t)] : null;
    render();
  });
  const release = () => {
    if (anchor === null) return;
    anchor = null;
    render();
    prepareSoon();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  handle.addEventListener('dragstart', (e) => {
    e.preventDefault();
    if (token) sono.library.cut.startDrag(token);
  });

  const noMod = item.source?.license?.level === 'nomod';
  openModal({
    title: `Découper « ${item.name} »`,
    size: 'wide',
    body: [
      noMod ? h('div', { class: 'license-box lic-box-orange' }, "La licence de ce son interdit de le modifier : un extrait ne peut servir qu'à un usage privé.") : null,
      stage,
      h('div', { class: 'row-inline' }, status, h('span', { class: 'spacer' }), handle),
    ],
    actions: [
      { label: 'Fermer' },
      { label: "Écouter l'extrait", onClick: () => { preview(); return false; } },
      {
        label: 'Ajouter à ma bibliothèque',
        primary: true,
        onClick: async () => {
          if (!range) {
            toast("Choisis d'abord un passage sur le tracé.", 'error');
            return false;
          }
          const ready = token ?? (await prepare());
          if (!ready) return false;
          const res = await sono.library.cut.save({ token: ready });
          if (res.error) {
            toast(`Échec : ${res.error}`, 'error', 6000);
            return false;
          }
          toast(`Ajouté à ta bibliothèque : « ${res.item.name} »`, 'ok');
          return true;
        },
      },
    ],
    onClose: () => {
      stopPreview();
      ctx?.close();
    },
  });

  try {
    if (item.size > MAX_BYTES) throw new Error('Son trop long pour la découpe rapide (plus de 80 Mo).');
    const res = await fetch(sono.library.fileUrl(item.id));
    if (!res.ok) throw new Error('Fichier introuvable.');
    const rate = Math.min(96000, Math.max(8000, Number(item.sampleRate) || 44100));
    audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await res.arrayBuffer());
    const peaks = peaksOf(audio);
    const draw = () => drawPeaks(canvas, peaks);
    new ResizeObserver(() => requestAnimationFrame(draw)).observe(canvas);
    draw();
    render();
  } catch (err) {
    status.className = 'gen-status warn-red';
    status.textContent = err.name === 'EncodingError' ? 'Le lecteur intégré ne sait pas lire ce format.' : err.message;
  }
}
