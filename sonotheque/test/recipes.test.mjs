// Vérifie que les recettes intégrées sont bien formées (sans lancer le moteur audio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', 'src', 'recipes');

test('chaque recette intégrée déclare nom, catégorie, mots-clés, réglages valides et render()', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.recette'));
  assert.ok(files.length >= 15);
  for (const f of files) {
    let def = null;
    new Function('recipe', fs.readFileSync(path.join(DIR, f), 'utf8'))((d) => { def = d; });
    assert.ok(def, `${f} : recipe() non appelée`);
    assert.equal(typeof def.render, 'function', `${f} : render manquant`);
    assert.ok(def.name && def.description, `${f} : nom/description`);
    assert.ok(['sfx', 'ambiance', 'musique', 'voix', 'autre'].includes(def.category), `${f} : catégorie`);
    assert.ok(def.keywords.length >= 1 && def.keywords.length <= 3, `${f} : 1 à 3 mots-clés`);
    for (const [k, p] of Object.entries(def.params ?? {})) {
      if (p.options) assert.ok(p.options.some((o) => o.value === p.default), `${f} : ${k} défaut`);
      else assert.ok(p.min < p.max && p.default >= p.min && p.default <= p.max, `${f} : ${k} bornes`);
    }
    assert.ok(def.params?.duration || def.duration, `${f} : durée`);
    assert.ok(!/Math\.random/.test(fs.readFileSync(path.join(DIR, f), 'utf8')), `${f} : utiliser rand()`);
  }
});

test('la consigne pour Claude / ChatGPT contient l\'emplacement de l\'exemple', () => {
  const t = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'synth', 'consigne-ia.txt'), 'utf8');
  assert.ok(t.includes('{EXEMPLE}'));
  assert.ok(t.includes('recipe({'));
});
