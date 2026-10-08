// Lecture des infos techniques d'un fichier audio (durée, fréquence, canaux, tags intégrés)
// et empreinte rapide pour détecter les doublons.

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';

/** Infos techniques ; lève une erreur si ce n'est pas un fichier audio lisible. */
export async function readAudioInfo(file) {
  const meta = await parseFile(file, { duration: true, skipCovers: true });
  const f = meta.format ?? {};
  const c = meta.common ?? {};
  if (!f.container && !f.codec && !f.duration) throw new Error('Format audio non reconnu');
  return {
    duration: Number.isFinite(f.duration) ? Math.round(f.duration * 1000) / 1000 : null,
    sampleRate: f.sampleRate ?? null,
    channels: f.numberOfChannels ?? null,
    bitrate: f.bitrate ? Math.round(f.bitrate) : null,
    codec: f.codec ?? f.container ?? null,
    embedded: {
      title: c.title ?? null,
      artist: c.artist ?? null,
      genre: c.genre ?? [],
      comment: (c.comment ?? []).map((x) => (typeof x === 'string' ? x : x?.text)).filter(Boolean),
    },
  };
}

/** Empreinte rapide : taille + début + fin du fichier (assez fiable pour repérer un doublon). */
export async function quickHash(file) {
  const CHUNK = 256 * 1024;
  const { size } = await fs.promises.stat(file);
  const fh = await fs.promises.open(file, 'r');
  try {
    const h = createHash('sha1');
    h.update(String(size));
    const head = Buffer.alloc(Math.min(CHUNK, size));
    await fh.read(head, 0, head.length, 0);
    h.update(head);
    if (size > CHUNK) {
      const tail = Buffer.alloc(Math.min(CHUNK, size - CHUNK));
      await fh.read(tail, 0, tail.length, size - tail.length);
      h.update(tail);
    }
    return h.digest('hex');
  } finally {
    await fh.close();
  }
}
