// Encodage compact des formes d'onde (100 valeurs 0..1 → 100 caractères), partagé
// entre l'interface et le processus principal.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function encodePeaks(peaks) {
  return peaks.map((p) => ALPHABET[Math.max(0, Math.min(35, Math.round(p * 35)))]).join('');
}

export function decodePeaks(str) {
  if (!str) return null;
  return [...str].map((c) => Math.max(0, ALPHABET.indexOf(c)) / 35);
}
