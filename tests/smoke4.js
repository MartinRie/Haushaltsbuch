const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const Module = require('module');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-'));
const userData = path.join(tmp, 'userData');
const docs = path.join(tmp, 'docs');
fs.mkdirSync(docs, { recursive: true });

/* ---------- Teil A: echte Main-Prozess-Logik mit nachgebautem "electron" ---------- */

const handlers = {};
let nextSave = null;
let nextOpen = null;
const electronMock = {
  app: {
    getPath: (n) => (n === 'userData' ? userData : docs),
    whenReady: () => ({ then: () => {} }),
    on: () => {},
    quit: () => {}
  },
  BrowserWindow: Object.assign(function () {}, { fromWebContents: () => null, getAllWindows: () => [] }),
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
  dialog: {
    showSaveDialog: async () => nextSave,
    showOpenDialog: async () => nextOpen
  },
  shell: { showItemInFolder() {}, openPath() {} },
  Menu: { setApplicationMenu() {} }
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? electronMock : origLoad.call(this, req, ...rest); };
require(path.join(root, 'main.js'));
Module._load = origLoad;

const good = {
  version: 1,
  categories: [{ name: 'Wohnen', type: 'expense' }, { name: 'Gehalt', type: 'income' }],
  transactions: [
    { id: 'a', type: 'income', amount: 245000, date: '2026-10-05', category: 'Gehalt', note: '', created: 1 },
    { id: 'b', type: 'expense', amount: 72000, date: '2026-10-01', category: 'Wohnen', note: 'Miete', created: 2, recurringId: 'r1' }
  ],
  recurring: [{ id: 'r1', type: 'expense', amount: 72000, category: 'Wohnen', note: 'Miete', interval: 'monthly', start: '2026-10-01', end: '', active: true, last: '2026-10-01' }],
  opening: { amount: 10000, month: '2026-10' }
};

(async () => {
  const { checkData, extract } = require(path.join(root, 'validate.js'));

  // Validierung
  assert.strictEqual(checkData(good), null);
  assert(checkData(null) && checkData([]) && checkData({}));
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(good)); mut(d); return checkData(d); };
  assert(bad((d) => { d.transactions[0].amount = 12.5; }), 'float amount');
  assert(bad((d) => { d.transactions[0].amount = -5; }), 'negative amount');
  assert(bad((d) => { d.transactions[0].date = '05.10.2026'; }), 'date format');
  assert(bad((d) => { d.transactions[0].type = 'x'; }), 'type');
  assert(bad((d) => { delete d.transactions[1].id; }), 'id');
  assert(bad((d) => { d.categories[0].name = ''; }), 'cat name');
  assert(bad((d) => { d.recurring[0].interval = 'weekly'; }), 'interval');
  assert(bad((d) => { d.opening.month = '2026'; }), 'opening');
  assert.strictEqual(bad((d) => { delete d.recurring; delete d.opening; }), null, 'old data without recurring/opening is fine');
  assert.deepStrictEqual(extract({ app: 'haushaltsbuch', data: good }), good);
  assert.deepStrictEqual(extract(good), good);

  // Sichern: Datei wird geschrieben, Abbrechen schreibt nichts
  nextSave = { canceled: true };
  assert.strictEqual(await handlers['data:backup']({ sender: {} }, good), null);
  const target = path.join(docs, 'sicherung.json');
  nextSave = { canceled: false, filePath: target };
  assert.strictEqual(await handlers['data:backup']({ sender: {} }, good), target);
  const written = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.strictEqual(written.app, 'haushaltsbuch');
  assert(written.exportedAt);
  assert.deepStrictEqual(written.data, good);
  await assert.rejects(() => handlers['data:backup']({ sender: {} }, { foo: 1 }), /Ungültige Daten/);

  // Wiederherstellen: gültig, abgebrochen, kaputt, kein JSON, fremdes JSON
  nextOpen = { canceled: false, filePaths: [target] };
  let r = await handlers['data:restore']({ sender: {} });
  assert.deepStrictEqual(r.data, good);
  assert(r.exportedAt && r.file === target);
  nextOpen = { canceled: true, filePaths: [] };
  assert.strictEqual(await handlers['data:restore']({ sender: {} }), null);

  const broken = path.join(docs, 'kaputt.json');
  fs.writeFileSync(broken, JSON.stringify({ app: 'haushaltsbuch', data: { categories: [], transactions: [{ id: 'x', type: 'expense', amount: 'viel', date: '2026-01-01', category: 'A' }] } }));
  nextOpen = { canceled: false, filePaths: [broken] };
  r = await handlers['data:restore']({ sender: {} });
  assert(r.error && r.error.includes('beschädigt'), r.error);

  const notjson = path.join(docs, 'text.json');
  fs.writeFileSync(notjson, 'das ist kein json');
  nextOpen = { canceled: false, filePaths: [notjson] };
  r = await handlers['data:restore']({ sender: {} });
  assert(r.error && r.error.includes('nicht gelesen'), r.error);

  const foreign = path.join(docs, 'fremd.json');
  fs.writeFileSync(foreign, JSON.stringify({ hello: 'world' }));
  nextOpen = { canceled: false, filePaths: [foreign] };
  r = await handlers['data:restore']({ sender: {} });
  assert(r.error && r.error.includes('keine Haushaltsbuch-Daten'), r.error);

  // rohe Datendatei (haushaltsbuch.json) wird auch akzeptiert
  const raw = path.join(docs, 'roh.json');
  fs.writeFileSync(raw, JSON.stringify(good));
  nextOpen = { canceled: false, filePaths: [raw] };
  r = await handlers['data:restore']({ sender: {} });
  assert.deepStrictEqual(r.data, good);

  // Sicherheitskopie: ohne Datendatei nichts, mit Datendatei eine Kopie
  assert.strictEqual(await handlers['data:safety-copy'](), null);
  await handlers['data:save']({}, good);
  const copy = await handlers['data:safety-copy']();
  assert(copy && /vor-wiederherstellung-.*\.json$/.test(copy));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(copy, 'utf8')), good);

  console.log('PART_A_OK');

  /* ---------- Teil B: Oberfläche ---------- */

  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  const saved = [];
  const calls = [];
  let confirmAnswer = true;
  let confirmText = '';
  let restoreResult = null;
  const current = { version: 1, categories: [{ name: 'Wohnen', type: 'expense' }], transactions: [{ id: 'z', type: 'expense', amount: 100, date: '2026-10-01', category: 'Wohnen', note: 'alt', created: 1 }], recurring: [] };

  w.addEventListener('error', (e) => errors.push(e.message));
  w.api = {
    load: async () => ({ data: JSON.parse(JSON.stringify(current)), file: '/tmp/h.json' }),
    save: async (d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    exportCsv: async () => null,
    reveal: async () => true,
    backup: async (d) => { calls.push(['backup', d.transactions.length]); return '/Users/x/Documents/Haushaltsbuch-Sicherung.json'; },
    restore: async () => restoreResult,
    safetyCopy: async () => { calls.push(['safety']); return '/tmp/copy.json'; }
  };
  w.confirm = (t) => { confirmText = t; return confirmAnswer; };
  w.alert = (m) => errors.push('alert: ' + m);
  w.crypto = require('crypto').webcrypto;
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  const tick = () => new Promise((r) => setTimeout(r, 30));
  await tick();

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const clickText = (sel, text) => { const el = $$(sel).find((b) => b.textContent.trim() === text); assert(el, 'missing ' + text); el.click(); };

  clickText('.nav-btn', 'Einstellungen');

  // Sichern
  clickText('button', 'Sicherung speichern …');
  await tick();
  assert.deepStrictEqual(calls[0], ['backup', 1]);
  assert($$('[role=status]').some((e) => e.textContent.includes('Sicherung gespeichert')));

  // Wiederherstellen: Fehler
  restoreResult = { error: 'Die Sicherung ist beschädigt (ungültige Buchung).' };
  clickText('button', 'Sicherung wiederherstellen …');
  await tick();
  assert($$('[role=status]').some((e) => e.textContent.includes('beschädigt')));
  assert.strictEqual(saved.length, 0, 'nothing saved on error');

  // Wiederherstellen: Abbruch im Dateidialog
  restoreResult = null;
  clickText('button', 'Sicherung wiederherstellen …');
  await tick();
  assert.strictEqual(saved.length, 0);

  // Wiederherstellen: abgelehnt in der Rückfrage
  restoreResult = { data: JSON.parse(JSON.stringify(good)), file: '/x.json', exportedAt: '2026-10-19T10:00:00.000Z' };
  confirmAnswer = false;
  clickText('button', 'Sicherung wiederherstellen …');
  await tick();
  assert(confirmText.includes('2 Buchungen') && confirmText.includes('1 Daueraufträge') && confirmText.includes('1 Buchungen'), confirmText);
  assert.strictEqual(saved.length, 0, 'declined: nothing saved');
  assert(!calls.some((c) => c[0] === 'safety'), 'declined: no safety copy');

  // Wiederherstellen: bestätigt
  confirmAnswer = true;
  clickText('button', 'Sicherung wiederherstellen …');
  await tick();
  assert(calls.some((c) => c[0] === 'safety'), 'safety copy made');
  assert(saved.length >= 1, 'saved');
  const out = saved[saved.length - 1];
  assert(out.transactions.some((t) => t.id === 'a') && !out.transactions.some((t) => t.id === 'z'), 'data replaced');
  assert($$('[role=status]').some((e) => e.textContent.includes('wiederhergestellt')), 'flash shown');

  // Daten sind sichtbar
  clickText('.nav-btn', 'Buchungen');
  assert($$('.row.full').some((r) => r.textContent.includes('Miete')), 'restored booking listed');

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  console.log('SMOKE4_OK');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
