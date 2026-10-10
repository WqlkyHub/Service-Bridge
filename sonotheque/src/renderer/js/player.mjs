// Lecteur audio (barre du bas) : lecture, forme d'onde cliquable, boucle, volume.

import { h, clear, formatDuration, Emitter } from './dom.mjs';
import { drawStrings, decodePeaks } from './waveform.mjs';
import { icon } from './icons.mjs';

const CALM = matchMedia('(prefers-reduced-motion: reduce)').matches; // pas de vibration des cordes

export class Player extends Emitter {
  constructor(root, { volume = 0.8, onVolume, autoplay = true, onAutoplay } = {}) {
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
    this.canvas = h('canvas', { class: 'pl-wave', title: 'Clique ou glisse pour te déplacer dans le son' });
    this.time = h('div', { class: 'pl-time' }, '0:00 / 0:00');
    this.loopBtn = h('button', { class: 'icon-btn', title: 'Lecture en boucle (L)', 'aria-pressed': 'false', onclick: () => this.setLoop(!this.audio.loop) }, icon('loop', { size: 18 }));
    this.autoBtn = h('button', {
      class: ['icon-btn', autoplay && 'active'], title: 'Écoute auto : joue le son dès que tu le sélectionnes avec ↑ ↓', 'aria-pressed': String(autoplay),
      onclick: () => {
        const on = !this.autoBtn.classList.contains('active');
        this.autoBtn.classList.toggle('active', on);
        this.autoBtn.setAttribute('aria-pressed', String(on));
        onAutoplay?.(on);
      },
    }, icon('autoplay', { size: 18 }));
    this.vol = h('input', {
      class: 'pl-volume', type: 'range', min: '0', max: '1', step: '0.01', value: String(volume), title: 'Volume',
      oninput: () => {
        this.audio.volume = Number(this.vol.value);
        this.onVolume?.(this.audio.volume);
      },
    });
    this.actions = h('div', { class: 'pl-actions' });
    this.root = root;
    this.level = 0; // niveau du son à l'endroit écouté : règle l'ampleur de la vibration des cordes

    root.append(
      this.btn,
      h('div', { class: 'pl-info' }, this.title, this.sub),
      h('div', { class: 'pl-wave-wrap' }, this.canvas),
      this.time,
      h('div', { class: 'pl-controls' }, this.loopBtn, this.autoBtn),
      h('label', { class: 'pl-vol-wrap' }, icon('volume', { size: 18 }), this.vol),
      this.actions,
    );
    this.renderButton();

    // Se déplacer dans le son : la tête de lecture suit la souris pendant tout le glissement,
    // pas seulement au relâchement.
    let scrubbing = false;
    const seek = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * this.audio.duration;
      this.drawProgress();
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.entry || !Number.isFinite(this.audio.duration)) return;
      scrubbing = true;
      // Capture : le glissement continue même si la souris sort de la barre.
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      seek(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (scrubbing) seek(e);
    });
    const release = () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (this.audio.paused) this.audio.play().catch(() => {});
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

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
    // Dessin reporté à l'image suivante : redessiner tout de suite change la mise en page
    // (texte du temps) et déclenche l'erreur « ResizeObserver loop ».
    new ResizeObserver(() => requestAnimationFrame(() => this.drawProgress())).observe(this.canvas);
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
    this.root.classList.toggle('is-playing', this.playing);
    // Animation fluide de la tête de lecture tant que le son joue, et un peu après chaque
    // changement : le temps que la couleur du paysage ait fini de fondre vers la nouvelle teinte.
    cancelAnimationFrame(this.raf);
    const settleUntil = performance.now() + 1300;
    const tick = () => {
      this.drawProgress();
      if (this.playing || performance.now() < settleUntil) {
        this.raf = requestAnimationFrame(tick);
      } else if (this.level) {
        // Dernière image : cordes au repos, même si l'animation a été suspendue (fenêtre cachée).
        this.level = 0;
        this.drawProgress();
      }
    };
    tick();
    this.emit('state', { key: this.currentKey, playing: this.playing });
  }

  renderButton() {
    this.btn.replaceChildren(icon(this.playing ? 'pause' : 'play', { size: 20 }));
    this.btn.setAttribute('aria-label', this.playing ? 'Pause' : 'Lecture');
    this.btn.disabled = !this.entry;
  }

  drawProgress() {
    const d = this.audio.duration;
    const t = this.audio.currentTime;
    const progress = Number.isFinite(d) && d > 0 ? t / d : 0;
    // Les cordes vibrent selon le niveau du son à l'endroit écouté (d'après sa forme d'onde),
    // et reviennent doucement au repos à la pause.
    const p = this.peaks;
    const target = !this.playing || CALM ? 0 : p?.length ? p[Math.min(p.length - 1, Math.floor(progress * p.length))] : 0.5;
    this.level += (target - this.level) * 0.18;
    drawStrings(this.canvas, { progress, level: this.level, time: performance.now() / 1000, head: Boolean(this.entry) });
    this.time.textContent = `${formatDuration(t)} / ${formatDuration(Number.isFinite(d) ? d : this.entry?.duration)}`;
  }
}
