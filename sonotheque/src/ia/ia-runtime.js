// Reconnaissance du contenu d'un son avec YAMNet (modèle de Google entraîné sur AudioSet :
// 521 catégories comme « Rain », « Door », « Footsteps »). Tout se passe sur le PC.
// Le processus principal envoie le modèle puis, pour chaque son, les octets du fichier ;
// on renvoie un score par catégorie.
(() => {
  'use strict';

  const RATE = 16000; // fréquence attendue par le modèle
  const WINDOW = RATE * 10; // on analyse des tranches de 10 s, toujours de la même taille
  const MAX_WINDOWS = 3;
  let model = null;

  /**
   * Découpe le son en tranches de taille fixe : une taille constante évite au moteur de se
   * reconfigurer à chaque son (2 s perdues sinon). Un son court est répété pour remplir la
   * tranche ; d'un son long on prend le début, le milieu et la fin.
   */
  function windows(samples) {
    if (samples.length <= WINDOW) {
      const w = new Float32Array(WINDOW);
      for (let i = 0; i < WINDOW; i++) w[i] = samples[i % samples.length];
      return [w];
    }
    const count = Math.min(MAX_WINDOWS, Math.floor(samples.length / WINDOW));
    return Array.from({ length: count }, (_, i) => {
      const start = count === 1 ? 0 : Math.floor((i * (samples.length - WINDOW)) / (count - 1));
      return samples.subarray(start, start + WINDOW);
    });
  }

  async function tag(bytes) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // decodeAudioData convertit directement à la fréquence du contexte.
    const audio = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(buffer);
    const samples = audio.getChannelData(0);
    if (!samples.length) throw new Error('son vide');
    const total = { scores: null, embedding: null };
    const parts = windows(samples);
    const add = (sum, values) => (sum ? sum.map((v, i) => v + values[i]) : Array.from(values));
    for (const part of parts) {
      // Le modèle renvoie trois tableaux (scores, empreintes, spectrogramme) dans un ordre qui
      // dépend de la façon dont il a été chargé : on prend celui qui a une colonne par catégorie.
      // (521 colonnes : les scores ; 1024 colonnes : l'« empreinte » du son, qui sert à comparer deux sons.)
      const [scores, embedding] = tf.tidy(() => {
        const out = model.predict(tf.tensor1d(part));
        return [521, 1024].map((n) => out.find((t) => t.shape[1] === n).mean(0));
      });
      total.scores = add(total.scores, await scores.data());
      total.embedding = add(total.embedding, await embedding.data());
      scores.dispose();
      embedding.dispose();
    }
    return { scores: total.scores.map((v) => v / parts.length), embedding: total.embedding.map((v) => v / parts.length) };
  }

  window.iaBridge.onRequest(async (msg) => {
    try {
      if (msg.type === 'init') {
        model = await tf.loadGraphModel(tf.io.fromMemory(msg.artifacts));
        window.iaBridge.reply({ id: msg.id, ok: true });
      } else if (msg.type === 'tag') {
        window.iaBridge.reply({ id: msg.id, ok: true, ...(await tag(msg.bytes)) });
      }
    } catch (err) {
      window.iaBridge.reply({ id: msg.id, ok: false, error: String(err?.message ?? err) });
    }
  });
})();
