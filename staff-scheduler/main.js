'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { readData, writeData } = require('./src/store');
const { generateSchedule } = require('./src/optimizer');

const dataFilePath = () => path.join(app.getPath('userData'), 'staff-scheduler-data.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('data:load', () => readData(dataFilePath()));

ipcMain.handle('data:save', (_event, data) => {
  writeData(dataFilePath(), data);
  return true;
});

ipcMain.handle('schedule:generate', (_event, { employees, shiftTemplates, options }) => {
  return generateSchedule(employees, shiftTemplates, options || {});
});

ipcMain.handle('export:csv', async (_event, { content, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || 'program.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { saved: false };
  fs.writeFileSync(filePath, content, 'utf8');
  return { saved: true, filePath };
});
