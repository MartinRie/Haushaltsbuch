'use strict';
// Update-Funktion: fragt die neueste Version auf GitHub ab, lädt die passende Datei,
// prüft sie per SHA-256 (SHA256SUMS.txt aus demselben Release) und spielt sie ein.
//
// Release-Dateien (vom GitHub-Workflow erzeugt), <v> = Version ohne "v":
//   Windows: Haushaltsbuch-Update-<v>.exe (klein, gleiche Serie)   Haushaltsbuch-Setup-<v>.exe (vollständig)
//   Mac:     Haushaltsbuch-<v>.asar (klein, gleiche Serie)          Haushaltsbuch-Mac-<v>.zip (vollständig)
//   Linux:   Haushaltsbuch-<v>-x86_64.AppImage
//   Alle:    SHA256SUMS.txt
// "Serie" = Major.Minor. Gleiche Serie heißt gleiche Electron-Laufzeit, dann reicht der Programmcode.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// -1: a < b, 0: gleich, 1: a > b, null: ungültig
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const sameSeries = (a, b) => {
  const x = parseVersion(a), y = parseVersion(b);
  return !!(x && y && x[0] === y[0] && x[1] === y[1]);
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function parseSums(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m) out[path.basename(m[2])] = m[1].toLowerCase();
  }
  return out;
}

// Hash des Asar-Headers (so wie Electron ihn in ElectronAsarIntegrity erwartet)
function asarHeaderHash(buf) {
  if (buf.length < 16) throw new Error('Keine gültige Programmdatei.');
  const len = buf.readUInt32LE(12);
  if (16 + len > buf.length) throw new Error('Keine gültige Programmdatei.');
  const header = buf.slice(16, 16 + len).toString('utf8');
  JSON.parse(header); // muss ein gültiges Inhaltsverzeichnis sein
  return sha256(Buffer.from(header, 'utf8'));
}

// Welche Datei passt zu diesem Rechner? env: { platform, arch, appImage, macWritable }
function pickAsset(release, current, env) {
  const v = String(release.tag_name || '').replace(/^v/, '');
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const find = (name) => assets.find((a) => a && a.name === name) || null;
  const small = sameSeries(v, current);
  if (env.platform === 'win32') {
    const a = small ? find(`Haushaltsbuch-Update-${v}.exe`) : null;
    if (a) return { kind: 'win-small', asset: a };
    const s = find(`Haushaltsbuch-Setup-${v}.exe`);
    if (s) return { kind: 'win-full', asset: s };
  } else if (env.platform === 'darwin') {
    const a = small && env.macWritable ? find(`Haushaltsbuch-${v}.asar`) : null;
    if (a) return { kind: 'mac-small', asset: a };
  } else if (env.platform === 'linux' && env.appImage && env.arch === 'x64') {
    const a = find(`Haushaltsbuch-${v}-x86_64.AppImage`);
    if (a) return { kind: 'linux-appimage', asset: a };
  }
  return { kind: 'page', asset: null };
}

// Prüft, ob es eine neuere Version gibt. fetchJson(url) -> Promise<object>
async function check({ repo, current, env, fetchJson }) {
  const rel = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
  if (!rel || typeof rel !== 'object' || !rel.tag_name) throw new Error('Keine Release-Informationen erhalten.');
  const latest = String(rel.tag_name).replace(/^v/, '');
  const cmp = compareVersions(latest, current);
  if (cmp === null) throw new Error(`Unbekannte Versionsangabe: ${rel.tag_name}`);
  const pageUrl = typeof rel.html_url === 'string' && rel.html_url.startsWith(`https://github.com/${repo}/`)
    ? rel.html_url : `https://github.com/${repo}/releases/latest`;
  if (cmp <= 0) return { status: 'current', current, latest };
  const pick = pickAsset(rel, current, env);
  const sums = (rel.assets || []).find((a) => a && a.name === 'SHA256SUMS.txt') || null;
  const prefix = `https://github.com/${repo}/releases/download/`;
  const okUrl = (a) => a && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(prefix);
  let kind = pick.kind;
  if (kind !== 'page' && (!okUrl(pick.asset) || !okUrl(sums))) kind = 'page';
  return {
    status: 'available',
    current,
    latest,
    notes: typeof rel.body === 'string' ? rel.body.slice(0, 2000) : '',
    pageUrl,
    kind,
    asset: kind === 'page' ? null : { name: pick.asset.name, url: pick.asset.browser_download_url, size: pick.asset.size || 0 },
    sumsUrl: kind === 'page' ? null : sums.browser_download_url
  };
}

// Lädt die Datei, prüft die Prüfsumme und liefert den Pfad.
// fetchBuffer(url, onProgress) -> Promise<Buffer>
async function download(info, { dir, fetchBuffer, fetchText, onProgress }) {
  const sums = parseSums(await fetchText(info.sumsUrl));
  const expected = sums[info.asset.name];
  if (!expected) throw new Error('Für die Update-Datei gibt es keine Prüfsumme.');
  const buf = await fetchBuffer(info.asset.url, onProgress);
  if (sha256(buf) !== expected) throw new Error('Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, info.asset.name);
  fs.writeFileSync(file, buf);
  return file;
}

// Mac: Programmcode in der App austauschen. run(cmd, args) -> Promise
async function applyMacSmall(file, { resourcesPath, version, run }) {
  const buf = fs.readFileSync(file);
  const headerHash = asarHeaderHash(buf);
  const asar = path.join(resourcesPath, 'app.asar');
  const plist = path.join(resourcesPath, '..', 'Info.plist');
  const bundle = path.resolve(resourcesPath, '..', '..');
  const plistBackup = fs.readFileSync(plist);
  const tmp = asar + '.new', old = asar + '.old';
  fs.writeFileSync(tmp, buf);
  fs.rmSync(old, { force: true });
  fs.renameSync(asar, old);
  try {
    fs.renameSync(tmp, asar);
    const pb = '/usr/libexec/PlistBuddy';
    await run(pb, ['-c', `Set :CFBundleShortVersionString ${version}`, plist]);
    await run(pb, ['-c', `Set :CFBundleVersion ${version}`, plist]);
    await run(pb, ['-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${headerHash}`, plist]).catch(() => {});
    await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
    await run('/usr/bin/xattr', ['-cr', bundle]).catch(() => {});
  } catch (e) {
    fs.rmSync(asar, { force: true });
    fs.renameSync(old, asar);
    fs.writeFileSync(plist, plistBackup);
    await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]).catch(() => {});
    throw e;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  fs.rmSync(old, { force: true });
}

// Linux: AppImage-Datei ersetzen
function applyLinuxAppImage(file, { appImage }) {
  const target = appImage;
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.neu`);
  fs.copyFileSync(file, tmp);
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, target);
}

function canWrite(p) {
  try { fs.accessSync(p, fs.constants.W_OK); return true; } catch (e) { return false; }
}

module.exports = {
  DAY, parseVersion, compareVersions, sameSeries, sha256, parseSums, asarHeaderHash,
  pickAsset, check, download, applyMacSmall, applyLinuxAppImage, canWrite
};
