// Moteur de synthèse de la Sonothèque.
// Il tourne dans une fenêtre invisible et isolée (pas d'accès au disque ni au réseau) et
// exécute des « recettes » : de petits programmes qui fabriquent un son avec la Web Audio API.
// Une recette s'écrit ainsi (voir src/recipes/ et le bouton « Consigne pour Claude / ChatGPT ») :
//
//   recipe({
//     name: 'Whoosh', description: '…', category: 'sfx', keywords: ['whoosh'],
//     params: { duration: { label: 'Durée', min: 0.2, max: 3, default: 0.8, step: 0.05, unit: 's' } },
//     render({ ctx, out, p, noise, filter, gain, env, play, rand }) { … },
//   });
(() => {
  'use strict';

  const SAMPLE_RATE = 44100;
  const PEAK_COUNT = 100;
  const compiled = new Map(); // clé -> { code, def, meta }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Chargement d'une recette

  function normalizeParams(params) {
    const out = {};
    for (const [key, d] of Object.entries(params ?? {})) {
      if (!d || typeof d !== 'object') continue;
      const label = String(d.label ?? key);
      if (Array.isArray(d.options) && d.options.length) {
        const options = d.options.map((o) => (o && typeof o === 'object'
          ? { value: String(o.value), label: String(o.label ?? o.value) }
          : { value: String(o), label: String(o) }));
        const def = String(d.default ?? options[0].value);
        out[key] = { type: 'choice', label, options, default: options.some((o) => o.value === def) ? def : options[0].value };
      } else {
        const min = Number(d.min ?? 0);
        const max = Number(d.max ?? 1);
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error(`Paramètre « ${key} » : min/max invalides.`);
        const step = Number(d.step) > 0 ? Number(d.step) : (max - min) / 100;
        out[key] = { type: 'range', label, min, max, step, unit: String(d.unit ?? ''), default: clamp(Number(d.default ?? min), min, max) };
      }
    }
    return out;
  }

  function compile(key, code) {
    const cached = compiled.get(key);
    if (cached && cached.code === code) return cached;
    let def = null;
    const recipe = (d) => { def = d; };
    // eslint-disable-next-line no-new-func
    new Function('recipe', `"use strict";\n${code}`)(recipe);
    if (!def || typeof def !== 'object') throw new Error('Le fichier doit appeler recipe({ … }).');
    if (typeof def.render !== 'function') throw new Error('La recette doit contenir une fonction render(api).');
    const meta = {
      name: String(def.name ?? 'Sans nom').slice(0, 60),
      description: String(def.description ?? '').slice(0, 200),
      category: ['sfx', 'ambiance', 'musique', 'voix', 'autre'].includes(def.category) ? def.category : 'sfx',
      keywords: (Array.isArray(def.keywords) ? def.keywords : []).map(String).slice(0, 6),
      params: normalizeParams(def.params),
    };
    const entry = { code, def, meta };
    compiled.set(key, entry);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // Outils mis à disposition des recettes

  function makeApi(ctx, out, rand, duration, total) {
    const noiseCache = new Map();

    function noiseBuffer(kind) {
      if (noiseCache.has(kind)) return noiseCache.get(kind);
      const len = Math.min(Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE * 8);
      const buf = ctx.createBuffer(2, Math.max(1, len), SAMPLE_RATE);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
        for (let i = 0; i < d.length; i++) {
          const w = rand() * 2 - 1;
          if (kind === 'pink') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
            b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
            b6 = w * 0.115926;
          } else if (kind === 'brown') {
            last = (last + 0.02 * w) / 1.02;
            d[i] = last * 3.5;
          } else {
            d[i] = w;
          }
        }
      }
      noiseCache.set(kind, buf);
      return buf;
    }

    const api = {
      ctx,
      out,
      duration,
      total,
      sampleRate: SAMPLE_RATE,
      /** Nombre aléatoire (reproductible pour une même variante) entre min et max. */
      rand: (min = 0, max = 1) => min + rand() * (max - min),
      randInt: (min, max) => Math.floor(min + rand() * (max - min + 1)),
      pick: (arr) => arr[Math.floor(rand() * arr.length)],
      /** Source de bruit en boucle : 'white', 'pink' (plus doux) ou 'brown' (grave). */
      noise(kind = 'white') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(kind);
        src.loop = true;
        return src;
      },
      /** Oscillateur : 'sine', 'square', 'sawtooth', 'triangle'. */
      osc(type = 'sine', freq = 440) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        return o;
      },
      filter(type = 'lowpass', freq = 1000, q = 0.7) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
      },
      gain(value = 1) {
        const g = ctx.createGain();
        g.gain.value = value;
        return g;
      },
      pan(value = 0) {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(value, -1, 1);
        return p;
      },
      /** Distorsion douce (amount 0 à 100). */
      shaper(amount = 20) {
        const s = ctx.createWaveShaper();
        const n = 2048;
        const curve = new Float32Array(n);
        const k = Math.max(0.01, amount);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        s.curve = curve;
        s.oversample = '2x';
        return s;
      },
      /** Réverbération synthétique (seconds = longueur, decay = vitesse d'extinction). */
      reverb(seconds = 2, decay = 3) {
        const len = Math.max(1, Math.floor(clamp(seconds, 0.05, 10) * SAMPLE_RATE));
        const ir = ctx.createBuffer(2, len, SAMPLE_RATE);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        const c = ctx.createConvolver();
        c.buffer = ir;
        return c;
      },
      /**
       * Enveloppe : env(gain.gain, [[0, 0], [0.01, 1], [0.5, 0]], 'exp')
       * points = [[temps en s, valeur], …] ; courbe 'linear' (défaut) ou 'exp'.
       */
      env(param, points, curve = 'linear') {
        if (!points?.length) return;
        const [t0, v0] = points[0];
        param.setValueAtTime(curve === 'exp' ? Math.max(v0, 0.0001) : v0, Math.max(0, t0));
        for (const [t, v] of points.slice(1)) {
          if (curve === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 0.0001), Math.max(0, t));
          else param.linearRampToValueAtTime(v, Math.max(0, t));
        }
      },
      /** Relie les nœuds à la suite et renvoie le dernier : chain(src, filtre, gain, out). */
      chain(...nodes) {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        return nodes[nodes.length - 1];
      },
      /** Démarre une source à `at` secondes et l'arrête à `stop` (par défaut : fin du son). */
      play(source, at = 0, stop = total) {
        source.start(Math.max(0, at));
        source.stop(Math.max(at + 0.001, stop));
        return source;
      },
    };
    return api;
  }

  // ---------------------------------------------------------------------------
  // Rendu, normalisation, encodage WAV

  async function render(entry, values, seed) {
    const { def, meta } = entry;
    const p = {};
    for (const [k, d] of Object.entries(meta.params)) {
      const v = values?.[k] ?? d.default;
      p[k] = d.type === 'range'
        ? clamp(Number.isFinite(Number(v)) ? Number(v) : d.default, d.min, d.max)
        : (d.options.some((o) => o.value === String(v)) ? String(v) : d.default);
    }
    const rawDuration = p.duration ?? (typeof def.duration === 'function' ? def.duration(p) : def.duration) ?? 1;
    const duration = clamp(Number(rawDuration) || 1, 0.05, 120);
    const rawTail = typeof def.tail === 'function' ? def.tail(p) : def.tail;
    const tail = clamp(Number(rawTail) || 0, 0, 10);
    const total = duration + tail;

    const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
    const out = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    out.connect(limiter).connect(ctx.destination);

    const api = makeApi(ctx, out, mulberry32(seed), duration, total);
    api.p = p;
    await def.render(api);
    const buffer = await ctx.startRendering();
    return finish(buffer);
  }

  function finish(buffer) {
    const chans = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const n = chans[0].length;
    let peak = 0;
    for (const d of chans) for (let i = 0; i < n; i++) {
      const a = Math.abs(d[i]);
      if (!Number.isFinite(a)) throw new Error('La recette a produit un signal invalide.');
      if (a > peak) peak = a;
    }
    if (peak < 1e-5) throw new Error('Le son généré est silencieux : vérifie que la recette se connecte bien à « out ».');
    const gain = 0.89 / peak; // ~ -1 dBFS
    const fadeIn = Math.min(n, Math.round(SAMPLE_RATE * 0.003));
    const fadeOut = Math.min(n, Math.round(SAMPLE_RATE * 0.015));
    for (const d of chans) {
      for (let i = 0; i < n; i++) d[i] *= gain;
      for (let i = 0; i < fadeIn; i++) d[i] *= i / fadeIn;
      for (let i = 0; i < fadeOut; i++) d[n - 1 - i] *= i / fadeOut;
    }

    const bucket = Math.max(1, Math.floor(n / PEAK_COUNT));
    const peaks = [];
    for (let b = 0; b < PEAK_COUNT; b++) {
      let m = 0;
      for (let i = b * bucket; i < Math.min(n, (b + 1) * bucket); i++) {
        const a = Math.max(Math.abs(chans[0][i]), Math.abs(chans[1][i]));
        if (a > m) m = a;
      }
      peaks.push(m);
    }
    const top = Math.max(...peaks, 1e-4);

    return {
      wav: encodeWav(chans, SAMPLE_RATE),
      peaks: peaks.map((x) => Math.max(0.04, x / top)),
      duration: n / SAMPLE_RATE,
    };
  }

  function encodeWav(chans, rate) {
    const n = chans[0].length;
    const numCh = chans.length;
    const buf = new ArrayBuffer(44 + n * numCh * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * numCh * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * numCh * 2, true); v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * numCh * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = clamp(chans[c][i], -1, 1);
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------------------
  // Dialogue avec le processus principal

  window.synthBridge.onRequest(async (msg) => {
    const { id, type } = msg;
    try {
      if (type === 'describe') {
        const results = msg.items.map(({ key, code }) => {
          try {
            return { key, meta: compile(key, code).meta };
          } catch (err) {
            return { key, error: String(err?.message ?? err) };
          }
        });
        window.synthBridge.reply({ id, ok: true, results });
      } else if (type === 'render') {
        const entry = compile(msg.key, msg.code);
        const res = await render(entry, msg.values, msg.seed >>> 0);
        window.synthBridge.reply({ id, ok: true, ...res, meta: entry.meta });
      }
    } catch (err) {
      window.synthBridge.reply({ id, ok: false, error: String(err?.message ?? err) });
    }
  });
})();
