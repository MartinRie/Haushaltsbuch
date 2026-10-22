const fs = require('fs');
const ResEdit = require('resedit');
const exePath = process.argv[2];
const icoPath = process.argv[3];
const version = require('../package.json').version;
if (!exePath || !icoPath) { console.error('Aufruf: node tools/patch-exe.js <Haushaltsbuch.exe> <icon.ico>'); process.exit(2); }

const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);

// Icon ersetzen
const groups = res.entries.filter((e) => e.type === 14);
console.log('icon groups before:', groups.map((g) => `${g.id}/${g.lang}`).join(', '));
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const g = groups[0];
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconFile.icons.map((i) => i.data));

// Versionsinfo (Name im Task-Manager statt "Electron")
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const [ma, mi, pa] = version.split('.').map(Number);
vi.setFileVersion(ma, mi, pa, 0, 1033);
vi.setProductVersion(ma, mi, pa, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'Haushaltsbuch',
  ProductName: 'Haushaltsbuch',
  InternalName: 'Haushaltsbuch',
  OriginalFilename: 'Haushaltsbuch.exe',
  FileVersion: version,
  ProductVersion: version,
  LegalCopyright: ''
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('patched', exePath);
