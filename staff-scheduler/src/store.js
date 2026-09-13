'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  employees: [],
  shiftTemplates: [],
  lastSchedule: null,
};

function readData(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Veri dosyası okunamadı, varsayılana dönülüyor:', err);
    }
    return { ...DEFAULT_DATA };
  }
}

function writeData(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

module.exports = { readData, writeData, DEFAULT_DATA };
