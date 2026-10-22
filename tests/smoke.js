const { JSDOM } = require('jsdom');
const path = require('path');
const assert = require('assert');

const saved = [];
const errors = [];
const base = {
  version: 1,
  categories: [
    { name: 'Wohnen', type: 'expense' }, { name: 'Lebensmittel', type: 'expense' },
    { name: 'Gehalt', type: 'income' }
  ],
  transactions: []
};

(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '../index.html'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push(e.message));
  w.api = {
    load: async () => ({ data: JSON.parse(JSON.stringify(base)), file: '/tmp/haushaltsbuch.json' }),
    save: async (d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    exportCsv: async (csv) => { w.__csv = csv; return '/tmp/x.csv'; },
    reveal: async () => true
  };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.confirm = () => true;
  w.alert = (m) => errors.push('alert: ' + m);
  w.crypto = require('crypto').webcrypto;

  const src = require('fs').readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  w.eval(src);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  await tick();

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const clickText = (sel, text) => { const el = $$(sel).find((b) => b.textContent.trim() === text); assert(el, 'missing ' + text); el.click(); return el; };

  assert($('h1').textContent.match(/\d{4}/), 'month title');
  assert($('.empty'), 'empty state');

  // Neue Buchung (Ausgabe)
  clickText('button', 'Neue Buchung');
  await tick();
  assert($('dialog[open]'), 'dialog open');
  $('#f-amount').value = '1.234,50 €';
  $('#f-note').value = 'Miete';
  $('#f-cat').value = 'Wohnen';
  $('.dlg-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await tick();
  assert.strictEqual(saved.length, 1, 'saved once');
  assert.strictEqual(saved[0].transactions[0].amount, 123450);
  assert.strictEqual(saved[0].transactions[0].type, 'expense');
  assert(!$('dialog[open]'), 'dialog closed');
  assert($('.row .amt.exp'), 'expense row shown');

  // Einnahme
  clickText('button', 'Neue Buchung');
  await tick();
  clickText('.seg.wide button', 'Einnahme');
  assert.deepStrictEqual([...$('#f-cat').options].map((o) => o.value), ['Gehalt']);
  $('#f-amount').value = '2450';
  $('.dlg-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await tick();
  assert.strictEqual(saved.length, 2);

  // ungültiger Betrag
  clickText('button', 'Neue Buchung');
  await tick();
  $('#f-amount').value = 'abc';
  $('.dlg-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await tick();
  assert($('.notice').textContent.includes('gültigen Betrag'), 'validation message');
  assert.strictEqual(saved.length, 2);
  clickText('button', 'Abbrechen');

  const cardsText = $('.cards').textContent;
  assert(cardsText.includes('2.450,00') && cardsText.includes('1.234,50'), 'cards: ' + cardsText);

  // Jahr
  clickText('.seg button', 'Jahr');
  assert($('.plot'), 'year chart');
  assert.strictEqual($$('.plot-col').length, 12);
  assert($('h1').textContent === String(new Date().getFullYear()));

  // Buchungen
  clickText('.nav-btn', 'Buchungen');
  assert.strictEqual($$('.row.full').length, 3, 'header + 2 rows');
  $('#bf-q').value = 'miete';
  $('#bf-q').dispatchEvent(new w.Event('input'));
  assert.strictEqual($$('.row.full').length, 2, 'filtered');
  $$('button[aria-label="Buchung löschen"]')[0].click();
  await tick();
  assert.strictEqual(saved.length, 3);
  assert.strictEqual(saved[2].transactions.length, 1);

  // Kategorien
  clickText('.nav-btn', 'Kategorien');
  const input = $$('.add-row input')[0];
  input.value = 'Haustier';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
  await tick();
  assert.strictEqual(saved.length, 4);
  assert(saved[3].categories.some((c) => c.name === 'Haustier' && c.type === 'expense'));

  // Einstellungen + CSV
  clickText('.nav-btn', 'Einstellungen');
  clickText('button', 'Als CSV exportieren (Excel)');
  await tick();
  assert(w.__csv.startsWith('Datum;Art;Kategorie;Beschreibung;Betrag'), w.__csv);
  assert(w.__csv.includes('Gehalt') && w.__csv.includes('2450,00'));

  assert.deepStrictEqual(errors, [], 'no runtime errors: ' + errors.join(' | '));
  console.log('SMOKE_OK');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
