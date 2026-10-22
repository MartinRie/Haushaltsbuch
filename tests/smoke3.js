const { JSDOM } = require('jsdom');
const path = require('path');
const assert = require('assert');

const iso = (d) => d.toLocaleDateString('sv-SE');
const n = new Date();
const first = (back) => iso(new Date(n.getFullYear(), n.getMonth() - back, 1));

const saved = [];
const errors = [];
const base = {
  version: 1,
  categories: [
    { name: 'Wohnen', type: 'expense' }, { name: 'Freizeit', type: 'expense' }, { name: 'Gehalt', type: 'income' }
  ],
  transactions: [],
  recurring: [
    { id: 'r1', type: 'expense', amount: 72000, category: 'Wohnen', note: 'Miete', interval: 'monthly', start: first(3), end: '', active: true, last: '' },
    { id: 'r2', type: 'expense', amount: 1500, category: 'Freizeit', note: 'Altes Abo', interval: 'monthly', start: first(3), end: iso(new Date(n.getFullYear(), n.getMonth() - 2, 28)), active: true, last: '' },
    { id: 'r3', type: 'expense', amount: 999, category: 'Freizeit', note: 'Pausiert', interval: 'monthly', start: first(3), end: '', active: false, last: '' }
  ]
};

(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '../index.html'), { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push(e.message));
  w.api = {
    load: async () => ({ data: JSON.parse(JSON.stringify(base)), file: '/tmp/h.json' }),
    save: async (d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    exportCsv: async () => null,
    reveal: async () => true
  };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.alert = (m) => errors.push('alert: ' + m);
  w.confirm = () => true;
  w.crypto = require('crypto').webcrypto;
  w.eval(require('fs').readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\nwindow.__occ = occurrence;');
  const tick = () => new Promise((r) => setTimeout(r, 30));
  await tick();

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const clickText = (sel, text) => { const el = $$(sel).find((b) => b.textContent.trim() === text); assert(el, 'missing ' + text); el.click(); };
  const submit = async () => { $('.dlg-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); };
  const last = () => saved[saved.length - 1];

  // 1) Start: Miete 4x (heute-3 .. heute), Altes Abo 2x (endet), Pausiertes nie
  assert.strictEqual(saved.length, 1, 'saved on start');
  const tx0 = last().transactions;
  assert.strictEqual(tx0.filter((t) => t.recurringId === 'r1').length, 4, 'Miete 4x');
  assert.strictEqual(tx0.filter((t) => t.recurringId === 'r2').length, 2, 'Abo 2x');
  assert.strictEqual(tx0.filter((t) => t.recurringId === 'r3').length, 0, 'pausiert 0x');

  // 2) Fokus: keine Doppelbuchung
  w.dispatchEvent(new w.Event('focus'));
  await tick();
  assert.strictEqual(saved.length, 1, 'no new save on focus');
  assert.strictEqual(last().transactions.length, 6);

  // 3) Ansicht
  clickText('.nav-btn', 'Daueraufträge');
  let rows = $$('.row.rec').map((r) => r.textContent);
  assert.strictEqual(rows.length, 4, 'header + 3 rows: ' + rows.join('|'));
  assert(rows.some((t) => t.includes('Altes Abo') && t.includes('beendet')), 'ended: ' + rows.join('|'));
  assert(rows.some((t) => t.includes('Pausiert') && t.includes('pausiert')), 'paused');
  assert(rows.some((t) => t.includes('Miete') && /\d{2}\.\d{2}\.\d{4}/.test(t)), 'next date');

  // 4) Neuer Dauerauftrag, Start vor 2 Monaten -> 3 Buchungen nachgebucht
  clickText('button', 'Neuer Dauerauftrag');
  await tick();
  assert($('dialog[open]'));
  $('#r-amount').value = '9,99';
  $('#r-note').value = 'Zeitung';
  $('#r-cat').value = 'Freizeit';
  $('#r-int').value = 'monthly';
  $('#r-start').value = first(2);
  await submit();
  assert(!$('dialog[open]'));
  assert.strictEqual(last().transactions.filter((t) => t.note === 'Zeitung').length, 3, 'backfill 3');
  w.dispatchEvent(new w.Event('focus'));
  await tick();
  assert.strictEqual(last().transactions.filter((t) => t.note === 'Zeitung').length, 3, 'still 3');

  // 5) Validierung: Ende vor Start, ungültiger Betrag
  clickText('button', 'Neuer Dauerauftrag');
  await tick();
  $('#r-amount').value = 'x';
  await submit();
  assert($('.notice').textContent.includes('gültigen Betrag'));
  $('#r-amount').value = '5';
  $('#r-start').value = first(0);
  $('#r-end').value = first(1);
  await submit();
  assert($('.notice').textContent.includes('Ende liegt vor'));
  clickText('button', 'Abbrechen');

  // 6) Pausieren / Fortsetzen: Fortsetzen bucht nichts nach
  const before = last().transactions.length;
  $$('button[aria-label="Dauerauftrag fortsetzen"]')[0].click();   // "Pausiert" fortsetzen
  await tick();
  assert.strictEqual(last().transactions.length, before, 'resume does not backfill');
  assert(last().recurring.find((r) => r.id === 'r3').active === true);
  assert(last().recurring.find((r) => r.id === 'r3').last, 'skipToNow set last');
  $$('button[aria-label="Dauerauftrag pausieren"]')[0].click();
  await tick();
  assert.strictEqual(last().recurring.filter((r) => !r.active).length, 1);

  // 7) Bearbeiten
  $$('button[aria-label="Dauerauftrag bearbeiten"]')[0].click();
  await tick();
  assert($('#r-amount').value.length > 0);
  clickText('button', 'Abbrechen');

  // 8) Buchungsliste zeigt das Symbol
  clickText('.nav-btn', 'Buchungen');
  assert($$('.row svg.rep').length >= 6, 'rep icons');

  // 9) Löschen: Buchungen bleiben
  clickText('.nav-btn', 'Daueraufträge');
  const txCount = last().transactions.length;
  const recCount = last().recurring.length;
  $$('button[aria-label="Dauerauftrag löschen"]')[0].click();
  await tick();
  assert.strictEqual(last().recurring.length, recCount - 1);
  assert.strictEqual(last().transactions.length, txCount);

  // 10) Kategorie mit Dauerauftrag ist nicht löschbar
  clickText('.nav-btn', 'Kategorien');
  const wohnenRow = $$('.cat-row').find((r) => r.textContent.includes('Wohnen'));
  assert(wohnenRow.querySelector('button').disabled, 'Wohnen locked');

  // 11) Terminrechnung
  const occ = (r, k) => w.__occ(r, k);
  assert.strictEqual(occ({ start: '2026-01-31', interval: 'monthly' }, 1), '2026-02-28');
  assert.strictEqual(occ({ start: '2026-01-31', interval: 'monthly' }, 2), '2026-03-31');
  assert.strictEqual(occ({ start: '2026-11-15', interval: 'monthly' }, 2), '2027-01-15');
  assert.strictEqual(occ({ start: '2026-11-15', interval: 'quarterly' }, 1), '2027-02-15');
  assert.strictEqual(occ({ start: '2024-02-29', interval: 'yearly' }, 1), '2025-02-28');
  assert.strictEqual(occ({ start: '2024-02-29', interval: 'yearly' }, 4), '2028-02-29');

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  console.log('SMOKE3_OK');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
