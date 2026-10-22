// Bedientest: Update-Hinweis und Updates-Feld in den Einstellungen
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');
const base = { version: 1, categories: [{ name: 'Wohnen', type: 'expense' }], transactions: [], recurring: [] };
const available = { status: 'available', current: '1.4.1', latest: '1.4.2', notes: 'Neu: Update-Funktion\n<b>kein HTML</b>', kind: 'win-small', asset: { name: 'Haushaltsbuch-Update-1.4.2.exe', size: 102400 }, pageUrl: 'https://github.com/MartinRie/Haushaltsbuch/releases/tag/v1.4.2' };

async function start(api) {
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  w.api = {
    load: async () => ({ data: JSON.parse(JSON.stringify(base)), file: '/tmp/h.json', version: '1.4.1' }),
    save: async () => true, exportCsv: async () => null, reveal: async () => true, backup: async () => null, restore: async () => null, safetyCopy: async () => null, importCsv: async () => null,
    ...api
  };
  w.confirm = () => true;
  w.eval(fs.readFileSync(path.join(root, 'importer.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 40));
  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const text = (el) => el.textContent.replace(/ /g, ' ');
  const settings = () => $$('.nav-btn').find((b) => b.textContent.trim() === 'Einstellungen').click();
  const tick = () => new Promise((r) => setTimeout(r, 30));
  return { w, $, $$, text, settings, tick, errors };
}

(async () => {
  /* 1. Beim Start wird ein Update gefunden */
  const log = [];
  let progressCb = null;
  let installResult = { status: 'launched' };
  let t = await start({
    updateSettings: async () => ({ auto: true, version: '1.4.1' }),
    updateCheck: async (force) => { log.push('check:' + force); return force ? { status: 'current', current: '1.4.1', latest: '1.4.1' } : available; },
    updateSetAuto: async (a) => { log.push('auto:' + a); return a; },
    updateInstall: async () => { log.push('install'); progressCb && progressCb(42); return installResult; },
    updateOpenPage: async () => { log.push('page'); return true; },
    onUpdateProgress: (cb) => { progressCb = cb; return () => { progressCb = null; }; }
  });
  assert.deepStrictEqual(log, ['check:false'], 'automatic check without force');
  const hint = t.$('.nav-btn.update-btn');
  assert(hint && t.text(hint).includes('Update 1.4.2'), 'sidebar hint');
  hint.click();
  assert(t.text(t.$('h1')).includes('Einstellungen'));
  let panel = t.$$('.panel').find((p) => p.querySelector('h2').textContent === 'Updates');
  assert(t.text(panel).includes('Installiert: Haushaltsbuch 1.4.1'));
  assert(t.text(panel).includes('Version 1.4.2 ist verfügbar.'));
  assert.strictEqual(t.$('.notes-text').textContent, 'Neu: Update-Funktion\n<b>kein HTML</b>', 'notes as plain text');
  assert(!t.$('.notes-text b'));
  assert.strictEqual(t.text(t.$('#upd-install')).trim(), 'Jetzt aktualisieren (100 KB)');
  assert(t.$('#upd-auto').checked);

  // Automatische Suche abschalten
  t.$('#upd-auto').checked = false;
  t.$('#upd-auto').dispatchEvent(new t.w.Event('change'));
  await t.tick();
  assert(log.includes('auto:false'));

  // Auf GitHub ansehen
  t.$$('button').find((b) => b.textContent.trim() === 'Auf GitHub ansehen').click();
  assert(log.includes('page'));

  // Installieren (Windows: Update-Programm startet)
  t.$('#upd-install').click();
  await t.tick();
  assert(log.includes('install'));
  assert(t.text(t.$('#upd-status')).includes('Das Update-Programm startet'), t.text(t.$('#upd-status')));

  // Fehler beim Installieren
  installResult = { error: 'Die heruntergeladene Datei ist beschädigt (Prüfsumme stimmt nicht).' };
  t.$('#upd-install').click();
  await t.tick();
  assert(t.text(t.$('#upd-status')).includes('hat nicht geklappt: Die heruntergeladene Datei ist beschädigt'));
  assert.strictEqual(t.$('#upd-status').className, 'notice');
  assert(!t.$('#upd-install').disabled, 'button usable again');

  // Jetzt suchen -> aktuell
  t.$('#upd-check').click();
  await t.tick();
  assert(log.includes('check:true'));
  assert(t.text(t.$('#upd-status')).includes('neueste Version'));
  assert(!t.$('#upd-install'));
  assert(!t.$('.nav-btn.update-btn'), 'hint gone');
  assert.deepStrictEqual(t.errors, []);

  /* 2. Kein Update, Fehler bei manueller Suche */
  t = await start({
    updateSettings: async () => ({ auto: false, version: '1.4.1' }),
    updateCheck: async (force) => (force ? { status: 'error', message: 'Auf GitHub ist noch keine Version veröffentlicht.' } : { status: 'skipped' }),
    updateSetAuto: async (a) => a, updateInstall: async () => ({}), updateOpenPage: async () => true
  });
  assert(!t.$('.nav-btn.update-btn'));
  t.settings();
  assert(!t.$('#upd-auto').checked, 'auto off shown');
  t.$('#upd-check').click();
  await t.tick();
  assert(t.text(t.$('#upd-status')).includes('nicht geklappt: Auf GitHub ist noch keine Version'));

  /* 3. Nur Download-Seite (z. B. Mac mit neuer Hauptversion) */
  t = await start({
    updateSettings: async () => ({ auto: true, version: '1.4.1' }),
    updateCheck: async () => ({ ...available, latest: '1.5.0', kind: 'page', asset: null }),
    updateSetAuto: async (a) => a, updateInstall: async () => ({ status: 'page' }), updateOpenPage: async () => true
  });
  t.settings();
  assert.strictEqual(t.text(t.$('#upd-install')).trim(), 'Download-Seite öffnen');
  assert(t.text(t.$('#upd-status')).includes('kein automatisches Update'));
  t.$('#upd-install').click();
  await t.tick();
  assert(t.text(t.$('#upd-status')).includes('Download-Seite wurde im Browser geöffnet'));

  /* 4. Alte Schnittstelle ohne Update-Funktion: kein Feld, kein Fehler */
  t = await start({});
  t.settings();
  assert(!t.$$('.panel h2').some((h) => h.textContent === 'Updates'));
  assert.deepStrictEqual(t.errors, []);

  console.log('SMOKE6_OK');
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
