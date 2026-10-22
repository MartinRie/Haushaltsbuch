'use strict';
// Baut die kleinen Update-Dateien aus einer fertigen app.asar:
//   Haushaltsbuch-Update-<v>.exe (Windows, braucht makensis) und Haushaltsbuch-Update-<v>-Mac.sh
// Aufruf: node tools/make-update.js <app.asar> <ausgabeordner>
//   Version kommt aus package.json, die Grundversion (SERIES) ist Major.Minor.
//   Umgebungsvariablen: MAKENSIS (Pfad zu makensis), NSISDIR (bei Bedarf).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const asar = require('@electron/asar');

const root = path.join(__dirname, '..');
const [asarPath, outDir] = process.argv.slice(2);
if (!asarPath || !outDir) { console.error('Aufruf: node tools/make-update.js <app.asar> <ausgabeordner>'); process.exit(2); }

const version = require(path.join(root, 'package.json')).version;
const series = version.split('.').slice(0, 2).join('.');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const buf = fs.readFileSync(asarPath);
const headerHash = sha(asar.getRawHeader(asarPath).headerString);

// Plausibilität: Version in der app.asar muss zu package.json passen
const pkgInAsar = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
if (pkgInAsar.version !== version) throw new Error(`app.asar hat Version ${pkgInAsar.version}, package.json ${version}`);

fs.mkdirSync(outDir, { recursive: true });

// Mac
const tpl = fs.readFileSync(path.join(root, 'installer', 'update-mac.sh.in'), 'utf8');
const script = tpl
  .replace(/@VERSION@/g, version)
  .replace(/@SERIES@/g, series)
  .replace(/@ASAR_SHA256@/g, sha(buf))
  .replace(/@HEADER_SHA256@/g, headerHash)
  + buf.toString('base64').replace(/.{76}/g, '$&\n') + '\n';
const macOut = path.join(outDir, `Haushaltsbuch-Update-${version}-Mac.sh`);
fs.writeFileSync(macOut, script, { mode: 0o755 });

// Windows
const makensis = process.env.MAKENSIS || 'makensis';
execFileSync(makensis, [
  '-V2',
  `-DASAR=${path.resolve(asarPath)}`,
  `-DVERSION=${version}`,
  `-DSERIES=${series}`,
  `-DOUTDIR=${path.resolve(outDir)}`,
  `-DICON=${path.join(root, 'build', 'icon.ico')}`,
  path.join(root, 'installer', 'update.nsi')
], { stdio: 'inherit' });

console.log(`Update ${version} (für ${series}.x) gebaut:`);
for (const f of fs.readdirSync(outDir).filter((f) => f.includes(`Update-${version}`))) {
  console.log(`  ${f}  ${fs.statSync(path.join(outDir, f)).size} Bytes`);
}
