const { JSDOM } = require('jsdom');
const path = require('path');
const assert = require('assert');

const iso = (d) => d.toLocaleDateString('sv-SE');
const n = new Date();
const prev = new Date(n.getFullYear(), n.getMonth() - 1, 10);
const prev2 = new Date(n.getFullYear(), n.getMonth() - 1, 11);
const cur = new Date(n.getFullYear(), n.getMonth(), 5);
const curMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;

const saved = [];
const errors = [];
const base = {
  version: 1,
  categories: [{ name: 'Wohnen', type: 'expense' }, { name: 'Gehalt', type: 'income' }],
  transactions: [
    { id: 'a', type: 'income', amount: 100000, date: iso(prev), category: 'Gehalt', note: '', created: 1 },
    { id: 'b', type: 'expense', amount: 30000, date: iso(prev2), category: 'Wohnen', note: '', created: 2 },
    { id: 'c', type: 'expense', amount: 5000, date: iso(cur), category: 'Wohnen', note: '', created: 3 }
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
  w.alert = (m) => errors.push('alert: ' + m);
  w.confirm = () => true;
  w.crypto = require('crypto').webcrypto;
  w.eval(require('fs').readFileSync(path.join(__dirname, '../app.js'), 'utf8'));
  const tick = () => new Promise((r) => setTimeout(r, 20));
  await tick();

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const cards = () => $('.cards').textContent.replace(/ /g, ' ');
  const clickText = (sel, text) => { const el = $$(sel).find((b) => b.textContent.trim() === text); assert(el, 'missing ' + text); el.click(); };

  // 1) ohne Anfangsbestand: Übertrag = Vormonat 1000 - 300 = 700, Saldo = 700 - 50 = 650
  let c = cards();
  assert(c.includes('Übertrag aus Vormonat') && c.includes('700,00'), 'carry 700: ' + c);
  assert(c.includes('Saldo (Monatsende)') && c.includes('650,00'), 'saldo 650: ' + c);

  // 2) Vormonat zeigt Übertrag 0 und Saldo 700
  $('button[aria-label="Voriger Monat"]').click();
  c = cards();
  assert(c.includes('Übertrag aus Vormonat0,00') || /Übertrag aus Vormonat\s*0,00/.test(c), 'prev carry 0: ' + c);
  assert(c.includes('700,00'), 'prev saldo 700: ' + c);
  $('button[aria-label="Nächster Monat"]').click();

  // 3) Anfangsbestand 500 zu Beginn des aktuellen Monats
  clickText('.nav-btn', 'Einstellungen');
  $('#op-amount').value = '500';
  $('#op-month').value = curMonth;
  clickText('button', 'Speichern');
  await tick();
  assert.deepStrictEqual(saved[saved.length - 1].opening, { amount: 50000, month: curMonth });
  clickText('.nav-btn', 'Übersicht');
  c = cards();
  assert(c.includes('500,00') && c.includes('450,00'), 'opening: ' + c);

  // 4) Monat vor dem Stichtag: Übertrag 0
  $('button[aria-label="Voriger Monat"]').click();
  c = cards();
  assert(/Übertrag aus Vormonat\s*0,00/.test(c), 'before stichtag: ' + c);

  // 5) negativer Anfangsbestand + Entfernen
  clickText('.nav-btn', 'Einstellungen');
  $('#op-amount').value = '-120,50';
  clickText('button', 'Speichern');
  await tick();
  assert.strictEqual(saved[saved.length - 1].opening.amount, -12050);
  $('#op-amount').value = 'abc';
  clickText('button', 'Speichern');
  assert($('.notice').textContent.includes('gültigen Betrag'));
  clickText('button', 'Entfernen');
  await tick();
  assert(!saved[saved.length - 1].opening, 'opening removed');

  // 6) Jahresansicht
  clickText('.nav-btn', 'Übersicht');
  clickText('.seg button', 'Jahr');
  c = cards();
  assert(c.includes('Übertrag aus Vorjahr') && c.includes('Saldo (Jahresende)'), 'year labels: ' + c);

  assert.deepStrictEqual(errors, [], errors.join(' | '));
  console.log('SMOKE2_OK');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
