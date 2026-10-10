// Pont minimal de la fenêtre de reconnaissance : recevoir une demande, renvoyer une réponse. Rien d'autre.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iaBridge', {
  onRequest: (fn) => ipcRenderer.on('ia:request', (_e, msg) => fn(msg)),
  reply: (msg) => ipcRenderer.send('ia:reply', msg),
});
