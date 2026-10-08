// Pont minimal de la fenêtre de synthèse : recevoir une demande, renvoyer une réponse. Rien d'autre.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('synthBridge', {
  onRequest: (fn) => ipcRenderer.on('synth:request', (_e, msg) => fn(msg)),
  reply: (msg) => ipcRenderer.send('synth:reply', msg),
});
