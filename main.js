'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { checkData, extract } = require('./validate');
const { decodeBuffer } = require('./importer');
const updater = require('./updater');

const dataFile = () => path.join(app.getPath('userData'), 'haushaltsbuch.json');

function defaultData() {
  return {
    version: 1,
    categories: [
      { name: 'Wohnen', type: 'expense' },
      { name: 'Lebensmittel', type: 'expense' },
      { name: 'Mobilität', type: 'expense' },
      { name: 'Freizeit', type: 'expense' },
      { name: 'Sonstiges', type: 'expense' },
      { name: 'Gehalt', type: 'income' },
      { name: 'Sonstige Einnahmen', type: 'income' }
    ],
    transactions: []
  };
}

function isValid(d) {
  return d && typeof d === 'object' && Array.isArray(d.categories) && Array.isArray(d.transactions);
}

ipcMain.handle('data:load', () => {
  const file = dataFile();
  const version = app.getVersion();
  try {
    if (!fs.existsSync(file)) return { data: defaultData(), file, version };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isValid(parsed)) throw new Error('Die Datendatei hat ein unerwartetes Format.');
    return { data: parsed, file, version };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e), file, version };
  }
});

ipcMain.handle('data:save', (_event, data) => {
  if (!isValid(data)) throw new Error('Ungültige Daten.');
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file.replace(/\.json$/, '.bak.json'));
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return true;
});

ipcMain.handle('data:export-csv', async (event, csv) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Buchungen exportieren',
    defaultPath: 'Haushaltsbuch.csv',
    filters: [{ name: 'CSV-Datei', extensions: ['csv'] }]
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, '﻿' + String(csv), 'utf8');
  return res.filePath;
});

ipcMain.handle('data:backup', async (event, data) => {
  if (!isValid(data)) throw new Error('Ungültige Daten.');
  const win = BrowserWindow.fromWebContents(event.sender);
  const stamp = new Date().toLocaleDateString('sv-SE');
  const res = await dialog.showSaveDialog(win, {
    title: 'Sicherung speichern',
    defaultPath: path.join(app.getPath('documents'), `Haushaltsbuch-Sicherung-${stamp}.json`),
    filters: [{ name: 'Haushaltsbuch-Sicherung', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return null;
  const payload = { app: 'haushaltsbuch', exportedAt: new Date().toISOString(), data };
  fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return res.filePath;
});

ipcMain.handle('data:restore', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Sicherung wiederherstellen',
    properties: ['openFile'],
    filters: [{ name: 'Haushaltsbuch-Sicherung', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const file = res.filePaths[0];
  try {
    if (fs.statSync(file).size > 50 * 1024 * 1024) return { error: 'Die Datei ist zu groß für eine Sicherung.' };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = extract(parsed);
    const problem = checkData(data);
    if (problem) return { error: problem };
    return { data, file, exportedAt: parsed && parsed.exportedAt ? parsed.exportedAt : null };
  } catch (e) {
    return { error: 'Die Datei konnte nicht gelesen werden. Ist es eine Haushaltsbuch-Sicherung?' };
  }
});

// Kontoauszug (CSV) auswählen und als Text zurückgeben; die Auswertung passiert in der Oberfläche
ipcMain.handle('data:import-csv', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Kontoauszug (CSV) auswählen',
    properties: ['openFile'],
    filters: [{ name: 'CSV-Datei', extensions: ['csv', 'txt'] }, { name: 'Alle Dateien', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const file = res.filePaths[0];
  try {
    if (fs.statSync(file).size > 20 * 1024 * 1024) return { error: 'Die Datei ist zu groß für einen Kontoauszug.' };
    return { text: decodeBuffer(fs.readFileSync(file)), file: path.basename(file) };
  } catch (e) {
    return { error: 'Die Datei konnte nicht gelesen werden.' };
  }
});

// Kopie der aktuellen Datendatei, bevor eine Sicherung eingespielt wird
ipcMain.handle('data:safety-copy', () => {
  const file = dataFile();
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = file.replace(/\.json$/, `.vor-wiederherstellung-${stamp}.json`);
  fs.copyFileSync(file, target);
  return target;
});

ipcMain.handle('data:reveal', () => {
  const file = dataFile();
  if (fs.existsSync(file)) shell.showItemInFolder(file);
  else shell.openPath(path.dirname(file));
  return true;
});

/* ---------- Updates ---------- */

const UPDATE_REPO = require('./package.json').updateRepo || 'MartinRie/Haushaltsbuch';
const MAX_DOWNLOAD = 400 * 1024 * 1024;
const updateFile = () => path.join(app.getPath('userData'), 'update.json');
let lastUpdate = null; // Ergebnis der letzten Prüfung (nur hier im Hauptprozess, nie aus der Oberfläche übernommen)

function readUpdateSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(updateFile(), 'utf8'));
    return { auto: s.auto !== false, lastCheck: Number(s.lastCheck) || 0, last: s.last || null };
  } catch (e) {
    return { auto: true, lastCheck: 0, last: null };
  }
}
function writeUpdateSettings(s) {
  try {
    fs.mkdirSync(path.dirname(updateFile()), { recursive: true });
    fs.writeFileSync(updateFile(), JSON.stringify(s, null, 2), 'utf8');
  } catch (e) { /* nicht wichtig */ }
}

// Nur für Tests ohne Internet: HB_UPDATE_MOCK zeigt auf eine JSON-Datei { url: lokaler Pfad }
const mock = !app.isPackaged && process.env.HB_UPDATE_MOCK ? JSON.parse(fs.readFileSync(process.env.HB_UPDATE_MOCK, 'utf8')) : null;

async function fetchRaw(url) {
  if (mock) {
    if (!mock[url]) return new Response('nicht gefunden', { status: 404 });
    return new Response(fs.readFileSync(mock[url]), { status: 200, headers: { 'content-length': String(fs.statSync(mock[url]).size) } });
  }
  const accept = url.startsWith('https://api.github.com/') ? 'application/vnd.github+json' : '*/*';
  return net.fetch(url, { headers: { 'User-Agent': `Haushaltsbuch/${app.getVersion()}`, Accept: accept } });
}
async function fetchOk(url) {
  const res = await fetchRaw(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'Auf GitHub ist noch keine Version veröffentlicht.' : `GitHub antwortet mit Fehler ${res.status}.`);
  return res;
}
const fetchJson = async (url) => (await fetchOk(url)).json();
const fetchText = async (url) => (await fetchOk(url)).text();
async function fetchBuffer(url, onProgress) {
  const res = await fetchOk(url);
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > MAX_DOWNLOAD) throw new Error('Die Update-Datei ist unerwartet groß.');
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (got > MAX_DOWNLOAD) throw new Error('Die Update-Datei ist unerwartet groß.');
    chunks.push(Buffer.from(value));
    if (onProgress && total) onProgress(Math.min(100, Math.round((got / total) * 100)));
  }
  return Buffer.concat(chunks);
}

function updateEnv() {
  const env = { platform: process.platform, arch: process.arch, appImage: null, macWritable: false };
  if (process.platform === 'linux' && process.env.APPIMAGE && updater.canWrite(process.env.APPIMAGE) && updater.canWrite(path.dirname(process.env.APPIMAGE))) {
    env.appImage = process.env.APPIMAGE;
  }
  if (process.platform === 'darwin' && app.isPackaged) {
    const res = process.resourcesPath;
    env.macWritable = updater.canWrite(res) && updater.canWrite(path.join(res, 'app.asar')) && updater.canWrite(path.join(res, '..', 'Info.plist'));
  }
  return env;
}

async function runUpdateCheck(force) {
  const s = readUpdateSettings();
  const current = app.getVersion();
  if (!force && (!s.auto || Date.now() - s.lastCheck < updater.DAY)) {
    // Gespeichertes Ergebnis nur zeigen, wenn es noch neuer ist als die laufende Version
    if (s.last && s.last.status === 'available' && updater.compareVersions(s.last.latest, current) === 1) {
      lastUpdate = s.last;
      return { ...s.last, current, cached: true };
    }
    return { status: 'skipped', current };
  }
  try {
    const result = await updater.check({ repo: UPDATE_REPO, current, env: updateEnv(), fetchJson });
    lastUpdate = result.status === 'available' ? result : null;
    writeUpdateSettings({ auto: s.auto, lastCheck: Date.now(), last: lastUpdate });
    return result;
  } catch (e) {
    return { status: 'error', current, message: String(e && e.message ? e.message : e) };
  }
}

ipcMain.handle('update:settings', () => ({ auto: readUpdateSettings().auto, version: app.getVersion(), repo: UPDATE_REPO }));
ipcMain.handle('update:set-auto', (_e, auto) => {
  const s = readUpdateSettings();
  writeUpdateSettings({ ...s, auto: !!auto });
  return !!auto;
});
ipcMain.handle('update:check', (_e, force) => runUpdateCheck(!!force));
ipcMain.handle('update:open-page', () => {
  const url = lastUpdate && lastUpdate.pageUrl ? lastUpdate.pageUrl : `https://github.com/${UPDATE_REPO}/releases/latest`;
  if (url.startsWith('https://github.com/')) shell.openExternal(url);
  return true;
});
ipcMain.handle('update:install', async (event) => {
  const info = lastUpdate;
  if (!info || info.status !== 'available') return { error: 'Es liegt kein Update vor. Bitte erneut nach Updates suchen.' };
  if (info.kind === 'page') {
    shell.openExternal(info.pageUrl);
    return { status: 'page' };
  }
  const send = (p) => { if (!event.sender.isDestroyed()) event.sender.send('update:progress', p); };
  try {
    const dir = path.join(app.getPath('temp'), 'haushaltsbuch-update');
    const file = await updater.download(info, { dir, fetchBuffer, fetchText, onProgress: send });
    if (info.kind === 'win-small' || info.kind === 'win-full') {
      const err = await shell.openPath(file); // startet das Update mit Windows-Rückfrage (UAC)
      if (err) throw new Error(err);
      setTimeout(() => app.quit(), 1500);
      return { status: 'launched' };
    }
    if (info.kind === 'mac-small') {
      const { execFile } = require('child_process');
      const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, (e) => (e ? reject(e) : resolve())));
      await updater.applyMacSmall(file, { resourcesPath: process.resourcesPath, version: info.latest, run });
      setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
      return { status: 'restarting' };
    }
    if (info.kind === 'linux-appimage') {
      const appImage = process.env.APPIMAGE;
      updater.applyLinuxAppImage(file, { appImage });
      setTimeout(() => { app.relaunch({ execPath: appImage, args: process.argv.slice(1) }); app.exit(0); }, 300);
      return { status: 'restarting' };
    }
    return { error: 'Unbekannte Update-Art.' };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F3F5F6',
    title: 'Haushaltsbuch',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile('index.html');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
