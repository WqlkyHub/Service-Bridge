// Pont sécurisé entre l'interface et le processus principal : l'interface n'a accès
// qu'aux fonctions listées ici (pas d'accès direct au disque ni à Node).

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function on(channel, fn) {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('sono', {
  init: () => ipcRenderer.invoke('app:init'),

  library: {
    pick: (mode) => ipcRenderer.invoke('lib:pick', mode),
    analyze: (paths) => ipcRenderer.invoke('lib:analyze', paths),
    import: (entries, opts) => ipcRenderer.invoke('lib:import', entries, opts),
    update: (id, patch) => ipcRenderer.invoke('lib:update', id, patch),
    remove: (ids, opts) => ipcRenderer.invoke('lib:remove', ids, opts),
    reveal: (id) => ipcRenderer.invoke('lib:reveal', id),
    openRoot: () => ipcRenderer.invoke('lib:openRoot'),
    startDrag: (ids) => ipcRenderer.send('lib:startDrag', ids),
    fileUrl: (id) => `sfxlib://item/${encodeURIComponent(id)}`,
    onChanged: (fn) => on('lib:changed', fn),
  },

  online: {
    search: (params) => ipcRenderer.invoke('online:search', params),
    resolve: (key) => ipcRenderer.invoke('online:resolve', key),
    download: (params) => ipcRenderer.invoke('online:download', params),
    onProgress: (fn) => on('download:progress', fn),
  },

  settings: {
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    pickLibrary: () => ipcRenderer.invoke('settings:pickLibrary'),
    connectFreesound: () => ipcRenderer.invoke('freesound:connect'),
    disconnectFreesound: () => ipcRenderer.invoke('freesound:disconnect'),
  },

  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  /** Chemin d'un fichier glissé depuis l'Explorateur Windows. */
  pathForFile: (file) => webUtils.getPathForFile(file),
});
