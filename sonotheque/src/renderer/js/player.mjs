// Lecteur audio (barre du bas) : lecture, forme d'onde cliquable, boucle, volume.

import { h, clear, formatDuration, Emitter } from './dom.mjs';
import { drawPeaks, decodePeaks } from './waveform.mjs';

export class Player extends Emitter {
  constructor(root, { volume = 0.8, onVolume } = {}) {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = volume;
    this.entry = null;
    this.peaks = null;
    this.onVolume = onVolume;

    this.btn = h('button', { class: 'pl-play', title: 'Lecture / pause (Espace)', 'aria-label': 'Lecture', onclick: () => this.toggle() });
    this.title = h('div', { class: 'pl-title' }, 'Aucun son sélectionné');
    this.sub = h('div', { class: 'pl-sub' }, 'Clique sur ▶ ou utilise les flèches ↑ ↓ pour écouter.');
    this.canvas = h('canvas', { class: 'pl-wave', title: 'Clique pour te déplacer dans le son' });
    this.time = h('div', { class: 'pl-time' }, '0:00 / 0:00');
    this.loopBtn = h('button', { class: 'pl-icon', title: 'Lecture en boucle', 'aria-pressed': 'false', onclick: () => this.setLoop(!this.audio.loop) }, '🔁');
    this.vol = h('input', {
      class: 'pl-volume', type: 'range', min: '0', max: '1', step: '0.01', value: String(volume), title: 'Volume',
      oninput: () => {
        this.audio.volume = Number(this.vol.value);
        this.onVolume?.(this.audio.volume);
      },
    });
    this.actions = h('div', { class: 'pl-actions' });

    root.append(
      this.btn,
      h('div', { class: 'pl-info' }, this.title, this.sub),
      h('div', { class: 'pl-wave-wrap' }, this.canvas),
      this.time,
      this.loopBtn,
      h('label', { class: 'pl-vol-wrap' }, h('span', { 'aria-hidden': 'true' }, '🔊'), this.vol),
      this.actions,
    );
    this.renderButton();

    this.canvas.addEventListener('click', (e) => {
      if (!this.entry || !Number.isFinite(this.audio.duration)) return;
      const r = this.canvas.getBoundingClientRect();
      this.audio.currentTime = ((e.clientX - r.left) / r.width) * this.audio.duration;
      if (this.audio.paused) this.audio.play().catch(() => {});
    });

    const a = this.audio;
    a.addEventListener('play', () => this.changed());
    a.addEventListener('pause', () => this.changed());
    a.addEventListener('ended', () => this.changed());
    a.addEventListener('timeupdate', () => this.drawProgress());
    a.addEventListener('loadedmetadata', () => this.drawProgress());
    a.addEventListener('error', () => {
      if (!this.entry) return;
      this.sub.textContent = this.entry.key.startsWith('web:')
        ? "Aperçu indisponible : la source ne répond pas ou refuse l'écoute pour le moment."
        : 'Lecture impossible (fichier déplacé ou supprimé, ou format non lu par le lecteur intégré).';
      this.changed();
    });
    new ResizeObserver(() => this.drawProgress()).observe(this.canvas);
  }

  get playing() {
    return !this.audio.paused && !this.audio.ended && !this.audio.error;
  }

  get currentKey() {
    return this.entry?.key ?? null;
  }

  /**
   * entry : { key, url, title, subtitle, peaks (chaîne encodée ou tableau), actions: [Element] }
   * Rejouer le même son le reprend au début.
   */
  async play(entry) {
    if (this.entry?.key === entry.key) {
      this.audio.currentTime = 0;
      await this.audio.play().catch(() => {});
      return;
    }
    this.entry = entry;
    this.peaks = Array.isArray(entry.peaks) ? entry.peaks : decodePeaks(entry.peaks);
    this.title.textContent = entry.title;
    this.title.title = entry.title;
    this.sub.textContent = entry.subtitle ?? '';
    clear(this.actions).append(...(entry.actions ?? []));
    this.audio.src = entry.url;
    this.drawProgress();
    try {
      await this.audio.play();
    } catch {
      // L'erreur est gérée par l'événement « error ».
    }
    this.changed();
  }

  /** Met à jour la forme d'onde (calculée après coup) sans couper la lecture. */
  setPeaks(key, peaks) {
    if (this.entry?.key !== key) return;
    this.peaks = Array.isArray(peaks) ? peaks : decodePeaks(peaks);
    this.drawProgress();
  }

  setActions(key, actions) {
    if (this.entry?.key !== key) return;
    clear(this.actions).append(...actions);
  }

  toggle() {
    if (!this.entry) return false;
    if (this.playing) this.audio.pause();
    else {
      if (this.audio.ended) this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
    }
    return true;
  }

  stop() {
    this.audio.pause();
    this.changed();
  }

  setLoop(on) {
    this.audio.loop = on;
    this.loopBtn.setAttribute('aria-pressed', String(on));
    this.loopBtn.classList.toggle('active', on);
  }

  seekBy(seconds) {
    if (!this.entry || !Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
  }

  changed() {
    this.renderButton();
    // Animation fluide de la tête de lecture tant que le son joue.
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.drawProgress();
      if (this.playing) this.raf = requestAnimationFrame(tick);
    };
    tick();
    this.emit('state', { key: this.currentKey, playing: this.playing });
  }

  renderButton() {
    this.btn.textContent = this.playing ? '❚❚' : '▶';
    this.btn.setAttribute('aria-label', this.playing ? 'Pause' : 'Lecture');
    this.btn.disabled = !this.entry;
  }

  drawProgress() {
    const d = this.audio.duration;
    const t = this.audio.currentTime;
    const progress = Number.isFinite(d) && d > 0 ? t / d : 0;
    if (!this.colors) {
      const styles = getComputedStyle(document.documentElement);
      this.colors = { color: styles.getPropertyValue('--wave').trim(), playedColor: styles.getPropertyValue('--accent').trim() };
    }
    drawPeaks(this.canvas, this.peaks, { progress, ...this.colors });
    this.time.textContent = `${formatDuration(t)} / ${formatDuration(Number.isFinite(d) ? d : this.entry?.duration)}`;
  }
}
