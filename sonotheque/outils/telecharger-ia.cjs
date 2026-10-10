// Télécharge le modèle de reconnaissance de sons (YAMNet, de Google) et la bibliothèque qui le
// fait tourner (TensorFlow.js), tous deux sous licence Apache 2.0, dans src/ia/modele/.
// Lancé automatiquement par « npm install ». Ces fichiers (17 Mo) ne sont pas dans le dépôt Git.
// Chaque fichier est vérifié par son empreinte SHA-256 : un fichier modifié est refusé.
// Sans eux, l'appli fonctionne normalement, simplement sans mots-clés automatiques.

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEST = path.join(__dirname, '..', 'src', 'ia', 'modele');
const MODEL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1/';
const FILES = [
  ['tf.min.js', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', '300dfae273d20b4046f46a06d735688f03675a807561e9bcb5f664eb2f3d2831'],
  ['model.json', `${MODEL}model.json?tfjs-format=file`, '552a4e59884a7fad25dbdbc1bbe75af2a416bca44de12523081d4b55606d59d3'],
  ['group1-shard1of4.bin', `${MODEL}group1-shard1of4.bin?tfjs-format=file`, '2ba509dbfc875e0483e5e3f6935cd9be9f986dd1219796c649422fd337dde4ca'],
  ['group1-shard2of4.bin', `${MODEL}group1-shard2of4.bin?tfjs-format=file`, 'b789c08119ef33a534475b964c25447586e18328039c06322d4b5337887d1fca'],
  ['group1-shard3of4.bin', `${MODEL}group1-shard3of4.bin?tfjs-format=file`, '464a4a19cfb207c81bbd6ba079d2f36402902c07faa8b6d305f438dc0ab74212'],
  ['group1-shard4of4.bin', `${MODEL}group1-shard4of4.bin?tfjs-format=file`, '311fcb65f9985e825a9f162b7ef82bdc81a745bff11f90bd7b1eaabbd1f55e6b'],
  ['classes.csv', 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv', 'cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2'],
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function main() {
  fs.mkdirSync(DEST, { recursive: true });
  for (const [name, url, hash] of FILES) {
    const file = path.join(DEST, name);
    if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === hash) continue; // déjà là
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name} : erreur ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== hash) throw new Error(`${name} : empreinte inattendue, fichier refusé`);
    fs.writeFileSync(file, buf);
    console.log(`IA : ${name} téléchargé`);
  }
}

main().catch((err) => {
  // On ne bloque pas l'installation : l'appli marche sans, les mots-clés automatiques en moins.
  console.warn(`IA : modèle non téléchargé (${err.message}). Relance « npm run ia » avec une connexion internet.`);
});
