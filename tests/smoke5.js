const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');
const n = new Date();
const ym = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;

const sparkasse = [
  'Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Glaeubiger ID;Mandatsreferenz;Kundenreferenz (End-to-End);Sammlerreferenz;Lastschrift Ursprungsbetrag;Auslagenersatz Ruecklastschrift;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Info',
  'DE12;01.10.26;01.10.26;MIETE;Miete Oktober;;;;;;;Vermieter GmbH;DE99;BIC;-720,00;EUR;Umsatz gebucht',
  'DE12;05.10.26;05.10.26;GEHALT/RENTE;Lohn 10/2026;;;;;;;Arbeitgeber AG;DE98;BIC;2.450,00;EUR;Umsatz gebucht',
  'DE12;07.10.26;07.10.26;KARTENZAHLUNG;REWE Markt;;;;;;;REWE Markt GmbH;DE97;BIC;-42,18;EUR;Umsatz gebucht'
].join('\r\n');

const base = {
  version: 1,
  categories: [
    { name: 'Lebensmittel', type: 'expense', budget: 30000 },
    { name: 'Freizeit', type: 'expense' },
    { name: 'Wohnen', type: 'expense' },
    { name: 'Mobilität', type: 'expense', budget: 10000 },
    { name: 'Gehalt', type: 'income' }
  ],
  transactions: [
    { id: 't1', type: 'expense', amount: 28640, date: `${ym}-01`, category: 'Lebensmittel', note: 'Einkauf', created: 1 },
    { id: 't2', type: 'expense', amount: 9400, date: `${ym}-01`, category: 'Freizeit', note: 'Kino', created: 2 },
    // für den Import: bekannte Beschreibung (Kategorie wird gelernt) und ein schon vorhandener Umsatz (Duplikat)
    { id: 't3', type: 'expense', amount: 72000, date: '2026-09-01', category: 'Wohnen', note: 'Vermieter GmbH – Miete September', created: 3 },
    { id: 't4', type: 'expense', amount: 72000, date: '2026-09-01', category: 'Wohnen', note: 'Vermieter GmbH – Miete Oktober', created: 4 },
    { id: 't5', type: 'expense', amount: 4218, date: '2026-10-07', category: 'Wohnen', note: 'REWE Markt GmbH – REWE Markt', created: 5 }
  ],
  recurring: []
};

(async () => {
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  const saved = [];
  let importResult = null;
  w.addEventListener('error', (e) => errors.push(e.message));
  w.api = {
    load: async () => ({ data: JSON.parse(JSON.stringify(base)), file: '/tmp/h.json' }),
    save: async (d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    exportCsv: async () => null, reveal: async () => true, backup: async () => null, restore: async () => null, safetyCopy: async () => null,
    importCsv: async () => importResult
  };
  w.confirm = () => true;
  w.alert = (m) => errors.push('alert: ' + m);
  w.crypto = require('crypto').webcrypto;
  w.eval(fs.readFileSync(path.join(root, 'importer.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  const tick = () => new Promise((r) => setTimeout(r, 30));
  await tick();

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const text = (el) => el.textContent.replace(/ /g, ' ');
  const clickText = (sel, t) => { const el = $$(sel).find((b) => b.textContent.trim() === t); assert(el, 'missing ' + t); el.click(); };
  const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change')); };
  const last = () => saved[saved.length - 1];

  /* ===== Budgets ===== */
  let panel = $$('.panel').find((p) => p.querySelector('h2') && p.querySelector('h2').textContent === 'Ausgaben nach Kategorie');
  let t = text(panel);
  assert(t.includes('286,40 € von 300,00 €') && t.includes('noch 13,60 € frei'), 'budget row: ' + t);
  assert(t.includes('0,00 € von 100,00 €') && t.includes('noch 100,00 € frei'), 'budget without spending: ' + t);
  assert(t.includes('94,00 €') && !t.includes('94,00 € von'), 'no budget row stays plain');
  assert(!$('.fill.over'), 'nothing over budget yet');

  // Jahresansicht: zwölffaches Budget
  clickText('.seg button', 'Jahr');
  panel = $$('.panel').find((p) => p.querySelector('h2') && p.querySelector('h2').textContent === 'Ausgaben nach Kategorie');
  assert(text(panel).includes('von 3.600,00 €'), 'year budget: ' + text(panel));
  clickText('.seg button', 'Monat');

  // Kategorien: Budget setzen, ändern, entfernen, ungültig
  clickText('.nav-btn', 'Kategorien');
  const inp = (name) => $(`input[aria-label="Monatsbudget für ${name}"]`);
  assert(inp('Lebensmittel').value === '300,00');
  assert(!$('input[aria-label="Monatsbudget für Gehalt"]'), 'no budget for income');
  change(inp('Freizeit'), '50');
  await tick();
  assert.strictEqual(last().categories.find((c) => c.name === 'Freizeit').budget, 5000);
  assert.strictEqual(inp('Freizeit').value, '50,00');
  change(inp('Freizeit'), 'abc');
  await tick();
  assert(text($('.notice')).includes('gültigen Betrag') || $$('.notice').some((e) => text(e).includes('gültigen Betrag')), 'invalid message');
  assert.strictEqual(inp('Freizeit').value, '50,00', 'reverted');
  change(inp('Lebensmittel'), '');
  await tick();
  assert.strictEqual(last().categories.find((c) => c.name === 'Lebensmittel').budget, undefined, 'budget removed');
  change(inp('Mobilität'), '0');
  await tick();
  assert.strictEqual(last().categories.find((c) => c.name === 'Mobilität').budget, undefined, '0 removes budget');

  // Überschreitung: Freizeit 94 von 50
  clickText('.nav-btn', 'Übersicht');
  panel = $$('.panel').find((p) => p.querySelector('h2') && p.querySelector('h2').textContent === 'Ausgaben nach Kategorie');
  t = text(panel);
  assert(t.includes('94,00 € von 50,00 €') && t.includes('Budget um 44,00 € überschritten'), 'over budget: ' + t);
  assert($('.fill.over') && $('.bar-sub.exp'), 'over styles');
  assert(!t.includes('von 300,00 €'), 'removed budget gone');

  /* ===== Import ===== */
  clickText('.nav-btn', 'Buchungen');
  clickText('button', 'Kontoauszug importieren …');
  assert(text($('h1')).includes('Kontoauszug importieren'));
  assert.strictEqual($$('.nav-btn').find((b) => b.classList.contains('active')).textContent.trim(), 'Buchungen');

  // Abbruch im Dateidialog / Fehler / leere Datei
  importResult = null;
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  assert(!$('#imp-date'), 'cancelled dialog stays on start');
  importResult = { error: 'Die Datei ist zu groß für einen Kontoauszug.' };
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  assert($$('.notice').some((e) => text(e).includes('zu groß')));
  importResult = { text: 'nur eine Zeile', file: 'x.csv' };
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  assert($$('.notice').some((e) => text(e).includes('keine Zeilen')));

  // Zu viele Zeilen
  const many = ['Datum;Text;Betrag'];
  for (let i = 0; i < 1600; i++) many.push(`01.10.2026;Posten ${i};-1,00`);
  importResult = { text: many.join('\n'), file: 'viel.csv' };
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  assert(text($('[role=status]')).includes('mehr als 1500'), 'too many: ' + text($('[role=status]')));
  assert($$('button').find((b) => /importieren$/.test(b.textContent.trim())).disabled, 'import disabled when too many');
  clickText('button', 'Abbrechen');
  clickText('button', 'Kontoauszug importieren …');

  // Sparkasse-Datei
  importResult = { text: sparkasse, file: 'umsaetze.csv' };
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  assert.strictEqual($('#imp-date').value, '1');
  assert.strictEqual($('#imp-amount').value, '14');
  assert.strictEqual($('#imp-desc1').value, '11');
  assert.strictEqual($('#imp-desc2').value, '4'.replace('4', '4'));
  let summary = text($$('[role=status]').find((e) => e.textContent.includes('erkannt')));
  assert(summary.includes('3 Buchungen erkannt') && summary.includes('2 ausgewählt') && summary.includes('1 schon vorhanden'), summary);
  let rows = $$('.row.imp').filter((r) => !r.classList.contains('head-row'));
  assert.strictEqual(rows.length, 3);
  const cat = (row) => row.querySelector('select').value;
  assert.strictEqual(cat(rows[0]), 'Wohnen', 'learned category');
  assert.strictEqual(cat(rows[1]), 'Gehalt', 'default income category');
  assert(text(rows[2]).includes('schon vorhanden'));
  assert.strictEqual(rows[2].querySelector('input[type=checkbox]').checked, false, 'duplicate not selected');
  assert(rows[0].querySelector('.amt.exp') && rows[1].querySelector('.amt.inc'));

  // Standard-Kategorie ändern wirkt nur auf nicht gelernte Zeilen
  change($('#imp-defexp'), 'Freizeit');
  rows = $$('.row.imp').filter((r) => !r.classList.contains('head-row'));
  assert.strictEqual(cat(rows[0]), 'Wohnen', 'learned stays');

  // Auswahl: alle abwählen, eine wieder anwählen
  const all = $('.row.imp.head-row input[type=checkbox]');
  all.checked = false; change(all);
  assert(text($$('[role=status]').find((e) => e.textContent.includes('erkannt'))).includes('0 ausgewählt'));
  const importBtn = () => $$('button').find((b) => /importieren$/.test(b.textContent.trim()));
  assert(importBtn().disabled, 'nothing selected -> disabled');
  rows = $$('.row.imp').filter((r) => !r.classList.contains('head-row'));
  const cb0 = rows[0].querySelector('input[type=checkbox]'); cb0.checked = true; change(cb0);
  const cb1 = rows[1].querySelector('input[type=checkbox]'); cb1.checked = true; change(cb1);
  assert(!importBtn().disabled);
  assert.strictEqual(importBtn().textContent.trim(), '2 Buchungen importieren');

  // Kategorie pro Zeile ändern
  rows = $$('.row.imp').filter((r) => !r.classList.contains('head-row'));
  change(rows[0].querySelector('select'), 'Freizeit');

  // Importieren
  const before = last().transactions.length;
  importBtn().click();
  await tick();
  const tx = last().transactions;
  assert.strictEqual(tx.length, before + 2);
  const miete = tx.find((x) => x.date === '2026-10-01' && x.amount === 72000 && x.id !== 't4');
  assert.deepStrictEqual([miete.type, miete.amount, miete.category, miete.note], ['expense', 72000, 'Freizeit', 'Vermieter GmbH – Miete Oktober']);
  const lohn = tx.find((x) => x.date === '2026-10-05');
  assert.deepStrictEqual([lohn.type, lohn.amount, lohn.category], ['income', 245000, 'Gehalt']);
  assert(miete.id && miete.created);
  assert(text($('[role=status]')).includes('2 Buchungen aus „umsaetze.csv“ importiert'), 'flash: ' + text($('[role=status]')));
  assert(text($('h1')).includes('Buchungen'));
  assert($$('.row.full').some((r) => r.textContent.includes('Lohn 10/2026') || r.textContent.includes('Arbeitgeber AG')));

  // Zweiter Import derselben Datei: alles ist jetzt vorhanden
  clickText('button', 'Kontoauszug importieren …');
  clickText('button', 'CSV-Datei auswählen …');
  await tick();
  summary = text($$('[role=status]').find((e) => e.textContent.includes('erkannt')));
  assert(summary.includes('3 schon vorhanden') && summary.includes('0 ausgewählt'), summary);
  assert(importBtn().disabled);

  // Vorzeichen umkehren
  const inv = $('#imp-invert'); inv.checked = true; change(inv);
  rows = $$('.row.imp').filter((r) => !r.classList.contains('head-row'));
  assert(rows[0].querySelector('.amt.inc'), 'inverted: rent becomes income');
  assert(rows[1].querySelector('.amt.exp'), 'inverted: salary becomes expense');

  // Kopfzeile manuell verschieben: falsche Zeile -> nichts erkannt, Hinweis
  change($('#imp-header'), '1');
  assert(text($$('[role=status]').find((e) => e.textContent.includes('Buchungen erkannt') || e.textContent.includes('keine Buchungen erkannt'))).length > 0);
  clickText('button', 'Abbrechen');
  assert(text($('h1')).includes('Buchungen'));

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  console.log('SMOKE5_OK');
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
