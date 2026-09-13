'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  generateSchedule: (payload) => ipcRenderer.invoke('schedule:generate', payload),
  exportCsv: (payload) => ipcRenderer.invoke('export:csv', payload),
});
