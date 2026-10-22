'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportCsv: (csv) => ipcRenderer.invoke('data:export-csv', csv),
  backup: (data) => ipcRenderer.invoke('data:backup', data),
  restore: () => ipcRenderer.invoke('data:restore'),
  safetyCopy: () => ipcRenderer.invoke('data:safety-copy'),
  importCsv: () => ipcRenderer.invoke('data:import-csv'),
  reveal: () => ipcRenderer.invoke('data:reveal'),
  updateSettings: () => ipcRenderer.invoke('update:settings'),
  updateSetAuto: (auto) => ipcRenderer.invoke('update:set-auto', auto),
  updateCheck: (force) => ipcRenderer.invoke('update:check', force),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  updateOpenPage: () => ipcRenderer.invoke('update:open-page'),
  onUpdateProgress: (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('update:progress', fn);
    return () => ipcRenderer.removeListener('update:progress', fn);
  }
});
