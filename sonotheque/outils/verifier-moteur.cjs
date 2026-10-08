// Vérifie l'empreinte SHA-256 du moteur Electron téléchargé, à partir de la liste officielle
// fournie avec le paquet electron (node_modules/electron/checksums.json).
// Usage : node outils/verifier-moteur.cjs <fichier.zip> <nom officiel du zip>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [zip, name] = process.argv.slice(2);
const sums = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'checksums.json'), 'utf8'));
const expected = sums[name];
if (!expected) {
  console.error(`  Empreinte officielle introuvable pour ${name}.`);
  process.exit(1);
}
if (!fs.existsSync(zip)) {
  console.error('  Le fichier téléchargé est introuvable.');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
if (hash !== expected) {
  console.error('  Le fichier téléchargé est incomplet ou modifié : installation annulée.');
  fs.rmSync(zip, { force: true });
  process.exit(1);
}
console.log('  Fichier vérifié (empreinte officielle Electron).');
