// Connexion au compte Freesound (OAuth2), nécessaire pour télécharger les fichiers ORIGINAUX
// (WAV/FLAC). Une petite fenêtre Freesound s'ouvre, tu te connectes et tu cliques « Autoriser » ;
// l'appli récupère le code automatiquement. Doc : https://freesound.org/docs/api/authentication.html

import { BrowserWindow } from 'electron';
import { randomBytes } from 'node:crypto';
import { getJson } from './http.mjs';

const AUTHORIZE_URL = 'https://freesound.org/apiv2/oauth2/authorize/';
const TOKEN_URL = 'https://freesound.org/apiv2/oauth2/access_token/';

async function requestToken(params) {
  const data = await getJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 86400) * 1000,
  };
}

/** Ouvre la fenêtre de connexion et renvoie les jetons (ou lève une erreur si annulé). */
export function connectFreesound({ clientId, apiKey, parent }) {
  if (!clientId || !apiKey) {
    return Promise.reject(new Error('Renseigne d\'abord le Client ID et la clé API Freesound.'));
  }
  const state = randomBytes(16).toString('hex');
  const url = `${AUTHORIZE_URL}?${new URLSearchParams({ client_id: clientId, response_type: 'code', state })}`;

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      parent,
      modal: true,
      width: 520,
      height: 720,
      title: 'Connexion à Freesound',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'freesound-auth' },
    });
    let done = false;

    const check = async (navUrl) => {
      if (done) return;
      let u;
      try {
        u = new URL(navUrl);
      } catch {
        return;
      }
      if (u.hostname !== 'freesound.org' || !u.searchParams.has('state')) return;
      if (u.searchParams.get('state') !== state) return;
      done = true;
      const code = u.searchParams.get('code');
      win.close();
      if (!code) {
        reject(new Error('Connexion refusée sur Freesound.'));
        return;
      }
      try {
        resolve(await requestToken({ client_id: clientId, client_secret: apiKey, grant_type: 'authorization_code', code }));
      } catch (err) {
        reject(new Error(`Freesound a refusé la connexion : ${err.message}`));
      }
    };

    win.webContents.on('will-redirect', (_e, u) => check(u));
    win.webContents.on('will-navigate', (_e, u) => check(u));
    win.webContents.on('did-navigate', (_e, u) => check(u));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => {
      if (!done) reject(new Error('Fenêtre de connexion fermée.'));
    });
    win.loadURL(url);
  });
}

/**
 * Renvoie un jeton d'accès valide (rafraîchi si besoin), ou null si le compte n'est pas connecté.
 * @param settingsStore store des réglages (mis à jour avec les nouveaux jetons)
 */
export async function getFreesoundAccessToken(settingsStore) {
  const s = settingsStore.get();
  const oauth = s.freesound?.oauth;
  if (!oauth?.refreshToken) return null;
  if (oauth.accessToken && oauth.expiresAt > Date.now() + 60_000) return oauth.accessToken;
  try {
    const tokens = await requestToken({
      client_id: s.freesound.clientId,
      client_secret: s.freesound.apiKey,
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
    });
    settingsStore.update({ freesound: { oauth: tokens } });
    return tokens.accessToken;
  } catch {
    // Connexion expirée (plus de 2 semaines ?) : on se rabat sur l'aperçu MP3.
    settingsStore.update({ freesound: { oauth: null } });
    return null;
  }
}
