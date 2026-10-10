// Réglages de l'application (dossier de la bibliothèque, clés API…).
// Stockés dans le dossier de données de l'appli (pas dans la bibliothèque, pour ne jamais
// partager tes clés en copiant ta bibliothèque). Les clés sont chiffrées avec le coffre de
// Windows (DPAPI via safeStorage d'Electron) quand c'est possible.

import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATHS = [
  'freesound.apiKey',
  'freesound.oauth.accessToken',
  'freesound.oauth.refreshToken',
  'jamendo.clientId',
];

export function defaultSettings(defaultLibraryPath) {
  return {
    libraryPath: defaultLibraryPath,
    copyOnImport: true,
    commercialOnly: false,
    translateOnline: true,
    autoTags: true, // mots-clés automatiques par reconnaissance des sons
    volume: 0.8,
    sources: { freesound: true, openverse: true, jamendo: true, archive: true, bbc: true },
    freesound: { apiKey: '', clientId: '', oauth: null },
    jamendo: { clientId: '' },
  };
}

function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, p, value) {
  const keys = p.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') return; // chemin absent : rien à faire
    o = o[k];
  }
  o[keys.at(-1)] = value;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string} opts.file          chemin du fichier JSON
 * @param {string} opts.defaultLibraryPath
 * @param {{encrypt(s:string):string, decrypt(s:string):string}|null} opts.crypto
 */
export function createSettingsStore({ file, defaultLibraryPath, crypto = null }) {
  let data = defaultSettings(defaultLibraryPath);
  const isNew = !fs.existsSync(file); // premier lancement

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const p of SECRET_PATHS) {
      const v = getPath(raw, p);
      if (typeof v === 'string' && v.startsWith('enc:')) {
        try {
          setPath(raw, p, crypto ? crypto.decrypt(v.slice(4)) : '');
        } catch {
          setPath(raw, p, ''); // clé illisible (autre PC / autre compte Windows) : à ressaisir
        }
      }
    }
    data = deepMerge(data, raw);
  } catch {
    // Premier lancement ou fichier abîmé : on garde les valeurs par défaut.
  }

  function save() {
    const copy = structuredClone(data);
    if (crypto) {
      for (const p of SECRET_PATHS) {
        const v = getPath(copy, p);
        if (typeof v === 'string' && v) setPath(copy, p, `enc:${crypto.encrypt(v)}`);
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(copy, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    isNew,
    get: () => data,
    update(patch) {
      data = deepMerge(data, patch);
      save();
      return data;
    },
    /** Version sans secrets, envoyée à l'interface. */
    publicView() {
      return {
        libraryPath: data.libraryPath,
        copyOnImport: data.copyOnImport,
        commercialOnly: data.commercialOnly,
        translateOnline: data.translateOnline,
        autoTags: data.autoTags,
        volume: data.volume,
        sources: data.sources,
        freesound: {
          hasApiKey: Boolean(data.freesound.apiKey),
          clientId: data.freesound.clientId,
          connected: Boolean(data.freesound.oauth?.refreshToken),
        },
        jamendo: { hasClientId: Boolean(data.jamendo.clientId) },
        encrypted: Boolean(crypto),
      };
    },
  };
}
