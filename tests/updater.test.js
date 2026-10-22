'use strict';
// Tests für updater.js (ohne Netz, ohne Electron)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const u = require('../updater');

const REPO = 'MartinRie/Haushaltsbuch';
const DL = `https://github.com/${REPO}/releases/download`;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

(async () => {
  /* Versionen */
  assert.strictEqual(u.compareVersions('1.4.2', '1.4.1'), 1);
  assert.strictEqual(u.compareVersions('v1.4.10', '1.4.9'), 1);
  assert.strictEqual(u.compareVersions('1.4.1', '1.4.1'), 0);
  assert.strictEqual(u.compareVersions('1.3.9', '1.4.0'), -1);
  assert.strictEqual(u.compareVersions('1.4', '1.4.0'), null);
  assert.strictEqual(u.compareVersions('1.4.0-beta', '1.4.0'), null);
  assert(u.sameSeries('1.4.9', 'v1.4.0') && !u.sameSeries('1.5.0', '1.4.9'));

  /* Prüfsummen-Datei */
  const sums = u.parseSums('aa'.repeat(32) + '  Haushaltsbuch-Setup-1.4.2.exe\r\n' + 'BB'.repeat(32) + ' *out/Haushaltsbuch-1.4.2.asar\nmüll\n');
  assert.deepStrictEqual(sums, { 'Haushaltsbuch-Setup-1.4.2.exe': 'aa'.repeat(32), 'Haushaltsbuch-1.4.2.asar': 'bb'.repeat(32) });

  /* Release-Daten */
  const asset = (name, size = 1000) => ({ name, size, browser_download_url: `${DL}/v1.4.2/${name}` });
  const release = (tag, names) => ({ tag_name: tag, html_url: `https://github.com/${REPO}/releases/tag/${tag}`, body: 'Neu: Update-Funktion', assets: names.map((n) => asset(n)) });
  const all142 = ['Haushaltsbuch-Setup-1.4.2.exe', 'Haushaltsbuch-Update-1.4.2.exe', 'Haushaltsbuch-Mac-1.4.2.zip', 'Haushaltsbuch-1.4.2.asar', 'Haushaltsbuch-1.4.2-x86_64.AppImage', 'Haushaltsbuch-Update-1.4.2-Mac.sh', 'SHA256SUMS.txt'];
  const win = { platform: 'win32', arch: 'x64' };
  const mac = { platform: 'darwin', arch: 'arm64', macWritable: true };
  const lin = { platform: 'linux', arch: 'x64', appImage: '/home/m/Haushaltsbuch.AppImage' };

  const pick = (rel, cur, env) => u.pickAsset(rel, cur, env);
  const r142 = release('v1.4.2', all142);
  assert.deepStrictEqual([pick(r142, '1.4.1', win).kind, pick(r142, '1.4.1', win).asset.name], ['win-small', 'Haushaltsbuch-Update-1.4.2.exe']);
  assert.strictEqual(pick(r142, '1.3.0', win).kind, 'win-full');
  assert.strictEqual(pick(r142, '1.4.1', mac).kind, 'mac-small');
  assert.strictEqual(pick(r142, '1.4.1', { ...mac, macWritable: false }).kind, 'page');
  assert.strictEqual(pick(r142, '1.3.0', mac).kind, 'page');
  assert.strictEqual(pick(r142, '1.4.1', lin).kind, 'linux-appimage');
  assert.strictEqual(pick(r142, '1.4.1', { ...lin, appImage: null }).kind, 'page');
  assert.strictEqual(pick(r142, '1.4.1', { ...lin, arch: 'arm64' }).kind, 'page');
  assert.strictEqual(pick(release('v1.4.2', ['Haushaltsbuch-Setup-1.4.2.exe']), '1.4.1', win).kind, 'win-full');
  assert.strictEqual(pick(release('v1.4.2', []), '1.4.1', win).kind, 'page');

  /* check() */
  const fetchJsonOf = (obj) => async (url) => { assert.strictEqual(url, `https://api.github.com/repos/${REPO}/releases/latest`); return obj; };
  let res = await u.check({ repo: REPO, current: '1.4.2', env: win, fetchJson: fetchJsonOf(r142) });
  assert.strictEqual(res.status, 'current');
  res = await u.check({ repo: REPO, current: '1.4.3', env: win, fetchJson: fetchJsonOf(r142) });
  assert.strictEqual(res.status, 'current', 'never downgrade');
  res = await u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf(r142) });
  assert.strictEqual(res.status, 'available');
  assert.strictEqual(res.kind, 'win-small');
  assert.strictEqual(res.latest, '1.4.2');
  assert.strictEqual(res.asset.url, `${DL}/v1.4.2/Haushaltsbuch-Update-1.4.2.exe`);
  assert.strictEqual(res.sumsUrl, `${DL}/v1.4.2/SHA256SUMS.txt`);
  assert.strictEqual(res.pageUrl, `https://github.com/${REPO}/releases/tag/v1.4.2`);
  assert.strictEqual(res.notes, 'Neu: Update-Funktion');
  // fremde Download-Adresse -> nur Download-Seite
  const evil = release('v1.4.2', all142);
  evil.assets[1].browser_download_url = 'https://example.com/x.exe';
  assert.strictEqual((await u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf(evil) })).kind, 'page');
  // fremde Release-Seite -> Standardseite
  const evil2 = release('v1.4.2', all142); evil2.html_url = 'https://example.com/';
  assert.strictEqual((await u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf(evil2) })).pageUrl, `https://github.com/${REPO}/releases/latest`);
  // ohne Prüfsummen-Datei kein automatisches Update
  assert.strictEqual((await u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf(release('v1.4.2', all142.filter((n) => n !== 'SHA256SUMS.txt'))) })).kind, 'page');
  // kaputte Antwort
  await assert.rejects(u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf({ message: 'Not Found' }) }));
  await assert.rejects(u.check({ repo: REPO, current: '1.4.0', env: win, fetchJson: fetchJsonOf({ tag_name: 'neu' }) }));

  /* download() */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hbupd-'));
  const payload = Buffer.from('MZ das ist die update-datei');
  const info = { asset: { name: 'Haushaltsbuch-Update-1.4.2.exe', url: `${DL}/v1.4.2/Haushaltsbuch-Update-1.4.2.exe` }, sumsUrl: `${DL}/v1.4.2/SHA256SUMS.txt` };
  const progress = [];
  const file = await u.download(info, {
    dir: path.join(tmp, 'dl'),
    fetchText: async () => `${sha(payload)}  Haushaltsbuch-Update-1.4.2.exe\n`,
    fetchBuffer: async (url, onP) => { onP(50); onP(100); return payload; },
    onProgress: (p) => progress.push(p)
  });
  assert(fs.readFileSync(file).equals(payload));
  assert.deepStrictEqual(progress, [50, 100]);
  await assert.rejects(u.download(info, { dir: tmp, fetchText: async () => `${'0'.repeat(64)}  Haushaltsbuch-Update-1.4.2.exe\n`, fetchBuffer: async () => payload }), /beschädigt/);
  await assert.rejects(u.download(info, { dir: tmp, fetchText: async () => `${sha(payload)}  andere.exe\n`, fetchBuffer: async () => payload }), /keine Prüfsumme/);

  /* asarHeaderHash() gegen das offizielle Paket */
  const asarLib = require('@electron/asar');
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'package.json'), '{"version":"1.4.2"}');
  fs.writeFileSync(path.join(src, 'main.js'), 'console.log(1)');
  const asarFile = path.join(tmp, 'app.asar');
  await asarLib.createPackage(src, asarFile);
  const official = crypto.createHash('sha256').update(asarLib.getRawHeader(asarFile).headerString).digest('hex');
  assert.strictEqual(u.asarHeaderHash(fs.readFileSync(asarFile)), official);
  assert.throws(() => u.asarHeaderHash(Buffer.from('kein asar')));

  /* applyMacSmall() mit nachgebauter App */
  const mkApp = () => {
    const app = path.join(tmp, `Haushaltsbuch-${Math.random().toString(36).slice(2)}.app`);
    const res = path.join(app, 'Contents', 'Resources');
    fs.mkdirSync(res, { recursive: true });
    fs.writeFileSync(path.join(res, 'app.asar'), 'ALT');
    fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), 'PLIST-ALT');
    return { app, res };
  };
  let calls = [];
  const okRun = async (cmd, args) => { calls.push([path.basename(cmd), ...args].join(' ')); };
  let m = mkApp();
  await u.applyMacSmall(asarFile, { resourcesPath: m.res, version: '1.4.2', run: okRun });
  assert(fs.readFileSync(path.join(m.res, 'app.asar')).equals(fs.readFileSync(asarFile)));
  assert.deepStrictEqual(fs.readdirSync(m.res), ['app.asar'], 'no leftovers');
  assert(calls.some((c) => c === `PlistBuddy -c Set :CFBundleShortVersionString 1.4.2 ${path.join(m.res, '..', 'Info.plist')}`));
  assert(calls.some((c) => c.includes(`ElectronAsarIntegrity:Resources/app.asar:hash ${official}`)));
  assert(calls.some((c) => c === `codesign --force --deep --sign - ${m.app}`));
  // Fehler beim Signieren -> alte Version zurück
  m = mkApp();
  calls = [];
  const badRun = async (cmd, args) => {
    calls.push(path.basename(cmd));
    if (path.basename(cmd) === 'PlistBuddy') fs.writeFileSync(path.join(m.res, '..', 'Info.plist'), 'PLIST-GEÄNDERT');
    if (path.basename(cmd) === 'codesign' && calls.filter((c) => c === 'codesign').length === 1) throw new Error('codesign kaputt');
  };
  await assert.rejects(u.applyMacSmall(asarFile, { resourcesPath: m.res, version: '1.4.2', run: badRun }), /codesign kaputt/);
  assert.strictEqual(fs.readFileSync(path.join(m.res, 'app.asar'), 'utf8'), 'ALT');
  assert.strictEqual(fs.readFileSync(path.join(m.res, '..', 'Info.plist'), 'utf8'), 'PLIST-ALT');
  assert.deepStrictEqual(fs.readdirSync(m.res), ['app.asar']);
  // ungültige Datei -> nichts angefasst
  m = mkApp();
  const junk = path.join(tmp, 'junk.asar');
  fs.writeFileSync(junk, 'kein asar');
  await assert.rejects(u.applyMacSmall(junk, { resourcesPath: m.res, version: '1.4.2', run: okRun }));
  assert.strictEqual(fs.readFileSync(path.join(m.res, 'app.asar'), 'utf8'), 'ALT');

  /* applyLinuxAppImage() */
  const ai = path.join(tmp, 'Haushaltsbuch.AppImage');
  fs.writeFileSync(ai, 'ALT');
  const neu = path.join(tmp, 'neu.AppImage');
  fs.writeFileSync(neu, 'NEU');
  u.applyLinuxAppImage(neu, { appImage: ai });
  assert.strictEqual(fs.readFileSync(ai, 'utf8'), 'NEU');
  assert.strictEqual(fs.statSync(ai).mode & 0o777, 0o755);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('UPDATER_OK');
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
