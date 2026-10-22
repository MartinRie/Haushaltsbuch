'use strict';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MINUS = '−';

const pad = (n) => String(n).padStart(2, '0');
const nf = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (cents) => nf.format(cents / 100);
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const now = new Date();

const state = {
  data: null,
  file: '',
  view: 'overview',
  mode: 'month',
  year: now.getFullYear(),
  month: now.getMonth(),
  bf: { year: 'all', month: 'all', q: '' }
};

/* ---------- kleine Helfer ---------- */

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : String(c));
  }
  return e;
}

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'
};

function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

function parseAmount(text) {
  let s = String(text).replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

const fmtInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');

// Betrag mit optionalem Minus (für den Anfangsbestand), 0 ist erlaubt
function parseSigned(text) {
  let s = String(text).replace(/[€\s]/g, '');
  let neg = false;
  if (s.startsWith('-') || s.startsWith(MINUS)) { neg = true; s = s.slice(1); }
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return neg ? -c : c;
}

// Kontostand zu Beginn eines Zeitraums (start = 'JJJJ-MM-01'):
// Anfangsbestand (falls gesetzt) plus alle Buchungen davor.
function carryBefore(start) {
  const op = state.data.opening;
  let sum = 0;
  let from = '';
  if (op && op.month) {
    from = op.month + '-01';
    if (start < from) return 0;
    sum = op.amount || 0;
  }
  for (const t of state.data.transactions) {
    if (t.date >= from && t.date < start) sum += t.type === 'income' ? t.amount : -t.amount;
  }
  return sum;
}

const periodStart = () => (state.mode === 'year' ? `${state.year}-01-01` : `${state.year}-${pad(state.month + 1)}-01`);
const shortDate = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
const longDate = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);

function sums(list) {
  let inc = 0;
  let exp = 0;
  for (const t of list) {
    if (t.type === 'income') inc += t.amount;
    else exp += t.amount;
  }
  return { inc, exp, saldo: inc - exp };
}

function periodTx() {
  const prefix = state.mode === 'year' ? `${state.year}-` : `${state.year}-${pad(state.month + 1)}-`;
  return state.data.transactions.filter((t) => t.date.startsWith(prefix));
}

function amountEl(t) {
  const sign = t.type === 'income' ? '+' : MINUS;
  return h('div', { class: 'amt ' + (t.type === 'income' ? 'inc' : 'exp') }, sign + eur(t.amount));
}

async function persist() {
  try {
    await window.api.save(state.data);
  } catch (e) {
    alert('Speichern fehlgeschlagen: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- Daueraufträge: Logik ---------- */

const INTERVALS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

// k-ter Termin eines Dauerauftrags; der Tag des ersten Termins bleibt erhalten
// (31. wird im Februar zum 28./29., im März wieder zum 31.)
function occurrence(r, k) {
  const [y, mo, d] = r.start.split('-').map(Number);
  const step = r.interval === 'yearly' ? 12 : r.interval === 'quarterly' ? 3 : 1;
  const total = (mo - 1) + k * step;
  const yy = y + Math.floor(total / 12);
  const mm = total % 12;
  const dd = Math.min(d, new Date(yy, mm + 1, 0).getDate());
  return `${yy}-${pad(mm + 1)}-${pad(dd)}`;
}

function nextDue(r) {
  for (let k = 0; k < 1200; k++) {
    const d = occurrence(r, k);
    if (r.end && d > r.end) return null;
    if (!r.last || d > r.last) return d;
  }
  return null;
}

// Beim Fortsetzen werden verpasste Termine übersprungen, nicht nachgebucht
function skipToNow(r) {
  const today = todayStr();
  for (let k = 0; k < 1200; k++) {
    const d = occurrence(r, k);
    if (d > today) break;
    if (!r.last || d > r.last) r.last = d;
  }
}

// Bucht alle fälligen Termine (bis heute) als normale Buchungen. true = es gab Änderungen.
function runRecurring() {
  const today = todayStr();
  let changed = false;
  for (const r of state.data.recurring || []) {
    if (!r.active) continue;
    for (let k = 0; k < 1200; k++) {
      const d = occurrence(r, k);
      if (d > today) break;
      if (r.end && d > r.end) break;
      if (r.last && d <= r.last) continue;
      state.data.transactions.push({
        id: uid(), created: Date.now(), type: r.type, amount: r.amount,
        date: d, category: r.category, note: r.note || '', recurringId: r.id
      });
      r.last = d;
      changed = true;
    }
  }
  return changed;
}

function noteCell(t) {
  const kids = [];
  if (t.recurringId) {
    const ic = icon('repeat', 14);
    ic.classList.add('rep');
    kids.push(ic);
  }
  kids.push(t.note || '—');
  return h('div', { title: t.recurringId ? 'Aus einem Dauerauftrag' : false }, ...kids);
}

/* ---------- Rahmen ---------- */

function renderNav() {
  const items = [
    ['overview', 'Übersicht', 'grid'],
    ['bookings', 'Buchungen', 'list'],
    ['categories', 'Kategorien', 'tag'],
    ['recurring', 'Daueraufträge', 'repeat']
  ];
  const mk = ([id, label, ic]) =>
    h('button', {
      type: 'button',
      class: 'nav-btn' + (state.view === id || (id === 'bookings' && state.view === 'import') ? ' active' : ''),
      'aria-current': state.view === id ? 'page' : false,
      onclick: () => { state.view = id; render(); }
    }, icon(ic), label);
  document.getElementById('nav').replaceChildren(
    ...items.map(mk),
    h('div', { class: 'spacer' }),
    state.update && state.update.status === 'available'
      ? h('button', {
          type: 'button', class: 'nav-btn update-btn',
          onclick: () => { state.view = 'settings'; render(); }
        }, icon('download'), `Update ${state.update.latest}`)
      : null,
    mk(['settings', 'Einstellungen', 'gear'])
  );
}

function render() {
  renderNav();
  const main = document.getElementById('main');
  const views = { overview: overviewView, bookings: bookingsView, categories: categoriesView, recurring: recurringView, import: importView, settings: settingsView };
  main.replaceChildren(views[state.view]());
}

/* ---------- Übersicht (Monat / Jahr) ---------- */

function periodHeader() {
  const step = (d) => {
    if (state.mode === 'year') {
      state.year += d;
    } else {
      state.month += d;
      if (state.month < 0) { state.month = 11; state.year -= 1; }
      if (state.month > 11) { state.month = 0; state.year += 1; }
    }
    render();
  };
  const yearMode = state.mode === 'year';
  const title = yearMode ? String(state.year) : `${MONTHS[state.month]} ${state.year}`;
  const segBtn = (label, mode) =>
    h('button', {
      type: 'button',
      class: state.mode === mode ? 'on' : false,
      'aria-pressed': String(state.mode === mode),
      onclick: () => { state.mode = mode; render(); }
    }, label);

  return h('div', { class: 'head' },
    h('div', { class: 'pager' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': yearMode ? 'Voriges Jahr' : 'Voriger Monat', onclick: () => step(-1) }, icon('left', 16)),
      h('h1', {}, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': yearMode ? 'Nächstes Jahr' : 'Nächster Monat', onclick: () => step(1) }, icon('right', 16))
    ),
    h('div', { class: 'head-right' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Zeitraum' }, segBtn('Monat', 'month'), segBtn('Jahr', 'year')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => openBooking() }, icon('plus', 16), 'Neue Buchung')
    )
  );
}

function card(label, value, cls) {
  return h('div', { class: 'card' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value ' + (cls || '') }, value)
  );
}

function overviewView() {
  const list = periodTx();
  const s = sums(list);
  const carry = carryBefore(periodStart());
  const end = carry + s.saldo;
  const left = state.mode === 'year' ? yearChartPanel() : recentPanel(list);
  return h('div', { class: 'stack' },
    periodHeader(),
    h('div', { class: 'cards' },
      card(state.mode === 'year' ? 'Übertrag aus Vorjahr' : 'Übertrag aus Vormonat', eur(carry), carry < 0 ? 'exp' : ''),
      card('Einnahmen', eur(s.inc), 'inc'),
      card('Ausgaben', eur(s.exp), 'exp'),
      card(state.mode === 'year' ? 'Saldo (Jahresende)' : 'Saldo (Monatsende)', eur(end), end < 0 ? 'exp' : '')
    ),
    h('div', { class: 'panels' }, left, categoryPanel(list))
  );
}

function recentPanel(list) {
  const rows = [...list].sort(byDateDesc).slice(0, 7);
  const body = rows.length
    ? [
        h('div', { class: 'row head-row' }, h('div', {}, 'Datum'), h('div', {}, 'Beschreibung'), h('div', {}, 'Kategorie'), h('div', { class: 'right' }, 'Betrag')),
        ...rows.map((t) =>
          h('div', { class: 'row' },
            h('div', { class: 'muted' }, shortDate(t.date)),
            noteCell(t),
            h('div', { class: 'muted' }, t.category),
            amountEl(t)
          )
        )
      ]
    : [h('div', { class: 'empty' }, 'Noch keine Buchungen in diesem Monat. Mit „Neue Buchung“ legst du die erste an.')];
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, 'Letzte Buchungen'),
      list.length > rows.length || list.length
        ? h('button', {
            type: 'button',
            class: 'btn link',
            onclick: () => {
              state.bf = { year: String(state.year), month: String(state.month), q: '' };
              state.view = 'bookings';
              render();
            }
          }, 'Alle anzeigen')
        : null
    ),
    ...body
  );
}

function yearChartPanel() {
  const inc = Array(12).fill(0);
  const exp = Array(12).fill(0);
  for (const t of state.data.transactions) {
    if (!t.date.startsWith(`${state.year}-`)) continue;
    const m = Number(t.date.slice(5, 7)) - 1;
    (t.type === 'income' ? inc : exp)[m] += t.amount;
  }
  const max = Math.max(1, ...inc, ...exp);
  const barH = (v) => (v > 0 ? Math.max(2, (v / max) * 100) + '%' : '0%');

  const plot = h('div', { class: 'plot' });
  const labels = h('div', { class: 'plot-labels' });
  const isNowYear = state.year === now.getFullYear();
  for (let m = 0; m < 12; m++) {
    const bi = h('div', { class: 'bar inc', title: `${MONTHS[m]}: Einnahmen ${eur(inc[m])}` });
    const be = h('div', { class: 'bar exp', title: `${MONTHS[m]}: Ausgaben ${eur(exp[m])}` });
    bi.style.height = barH(inc[m]);
    be.style.height = barH(exp[m]);
    plot.append(h('div', { class: 'plot-col' }, bi, be));
    labels.append(h('div', { class: isNowYear && m === now.getMonth() ? 'now' : false }, MON[m]));
  }

  let monthsCount = 0;
  if (state.year < now.getFullYear()) monthsCount = 12;
  else if (state.year === now.getFullYear()) monthsCount = now.getMonth() + 1;
  const totalExp = exp.reduce((a, b) => a + b, 0);
  const avg = monthsCount > 0 && totalExp > 0 ? h('div', { class: 'muted' }, `Ø Ausgaben pro Monat: ${eur(Math.round(totalExp / monthsCount))}`) : null;

  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, 'Monat für Monat'),
      h('div', { class: 'legend' },
        h('span', {}, h('i', { class: 'swatch inc' }), 'Einnahmen'),
        h('span', {}, h('i', { class: 'swatch exp' }), 'Ausgaben')
      )
    ),
    plot,
    labels,
    avg
  );
}

function categoryPanel(list) {
  const spent = new Map();
  for (const t of list) {
    if (t.type !== 'expense') continue;
    spent.set(t.category, (spent.get(t.category) || 0) + t.amount);
  }
  // Monatsbudget; in der Jahresansicht gilt das Zwölffache
  const factor = state.mode === 'year' ? 12 : 1;
  const budgets = new Map(
    state.data.categories.filter((c) => c.type === 'expense' && c.budget > 0).map((c) => [c.name, c.budget * factor])
  );
  const entries = [...new Set([...spent.keys(), ...budgets.keys()])]
    .map((name) => ({ name, cents: spent.get(name) || 0, budget: budgets.get(name) || 0 }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'de'));
  const max = Math.max(1, ...entries.filter((e) => !e.budget).map((e) => e.cents));

  const items = entries.map((e) => {
    const fill = h('div', { class: 'fill' });
    if (!e.budget) {
      fill.style.width = Math.max(2, (e.cents / max) * 100) + '%';
      return h('div', { class: 'bar-item' },
        h('div', { class: 'bar-line' }, h('span', {}, e.name), h('span', { class: 'muted' }, eur(e.cents))),
        h('div', { class: 'track' }, fill)
      );
    }
    const over = e.cents > e.budget;
    fill.style.width = (e.cents > 0 ? Math.max(2, Math.min(100, (e.cents / e.budget) * 100)) : 0) + '%';
    if (over) fill.classList.add('over');
    return h('div', { class: 'bar-item' },
      h('div', { class: 'bar-line' }, h('span', {}, e.name), h('span', { class: 'muted' }, `${eur(e.cents)} von ${eur(e.budget)}`)),
      h('div', { class: 'track' }, fill),
      h('div', { class: 'bar-sub' + (over ? ' exp' : '') }, over ? `Budget um ${eur(e.cents - e.budget)} überschritten` : `noch ${eur(e.budget - e.cents)} frei`)
    );
  });
  return h('section', { class: 'panel' },
    h('h2', {}, 'Ausgaben nach Kategorie'),
    ...(items.length ? items : [h('div', { class: 'empty' }, 'Noch keine Ausgaben in diesem Zeitraum.')])
  );
}

/* ---------- Buchungen ---------- */

function bookingsView() {
  const years = new Set([String(now.getFullYear())]);
  for (const t of state.data.transactions) years.add(t.date.slice(0, 4));
  const yearOpts = ['all', ...[...years].sort().reverse()];

  const yearSel = h('select', { id: 'bf-year' },
    ...yearOpts.map((y) => h('option', { value: y, selected: state.bf.year === y }, y === 'all' ? 'Alle Jahre' : y)));
  const monthSel = h('select', { id: 'bf-month' },
    h('option', { value: 'all', selected: state.bf.month === 'all' }, 'Alle Monate'),
    ...MONTHS.map((m, i) => h('option', { value: String(i), selected: state.bf.month === String(i) }, m)));
  const search = h('input', { type: 'search', id: 'bf-q', placeholder: 'Beschreibung oder Kategorie', value: state.bf.q, autocomplete: 'off' });

  const summary = h('div', { class: 'muted' });
  const listBox = h('div', {});

  const filtered = () => {
    const { year, month, q } = state.bf;
    const needle = q.trim().toLowerCase();
    return state.data.transactions
      .filter((t) => {
        if (year !== 'all' && t.date.slice(0, 4) !== year) return false;
        if (month !== 'all' && Number(t.date.slice(5, 7)) - 1 !== Number(month)) return false;
        if (needle && !`${t.note || ''} ${t.category}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort(byDateDesc);
  };

  const renderList = () => {
    const rows = filtered();
    const s = sums(rows);
    summary.textContent = `${rows.length} ${rows.length === 1 ? 'Buchung' : 'Buchungen'} · Einnahmen ${eur(s.inc)} · Ausgaben ${eur(s.exp)}`;
    if (!rows.length) {
      listBox.replaceChildren(h('div', { class: 'empty' }, 'Keine Buchungen für diese Auswahl.'));
      return;
    }
    listBox.replaceChildren(
      h('div', { class: 'row full head-row' }, h('div', {}, 'Datum'), h('div', {}, 'Beschreibung'), h('div', {}, 'Kategorie'), h('div', { class: 'right' }, 'Betrag'), h('div', {})),
      ...rows.map((t) =>
        h('div', { class: 'row full' },
          h('div', { class: 'muted' }, longDate(t.date)),
          noteCell(t),
          h('div', { class: 'muted' }, t.category),
          amountEl(t),
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Buchung bearbeiten', onclick: () => openBooking(t) }, icon('edit', 16)),
            h('button', {
              type: 'button', class: 'icon-btn small', 'aria-label': 'Buchung löschen',
              onclick: async () => {
                if (!confirm('Diese Buchung wirklich löschen?')) return;
                state.data.transactions = state.data.transactions.filter((x) => x.id !== t.id);
                await persist();
                renderList();
              }
            }, icon('trash', 16))
          )
        )
      )
    );
  };

  yearSel.addEventListener('change', () => { state.bf.year = yearSel.value; renderList(); });
  monthSel.addEventListener('change', () => { state.bf.month = monthSel.value; renderList(); });
  search.addEventListener('input', () => { state.bf.q = search.value; renderList(); });
  renderList();

  const flash = h('div', { class: 'muted', role: 'status' }, state.flash || '');
  state.flash = '';

  return h('div', { class: 'stack' },
    h('div', { class: 'head' },
      h('h1', { class: 'title' }, 'Buchungen'),
      h('div', { class: 'head-right' },
        h('button', { type: 'button', class: 'btn', onclick: () => { state.imp = null; state.impError = ''; state.view = 'import'; render(); } }, 'Kontoauszug importieren …'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => openBooking() }, icon('plus', 16), 'Neue Buchung')
      )
    ),
    flash,
    h('div', { class: 'filters' },
      h('label', { class: 'field' }, 'Jahr', yearSel),
      h('label', { class: 'field' }, 'Monat', monthSel),
      h('label', { class: 'field' }, 'Suchen', search)
    ),
    summary,
    h('section', { class: 'panel' }, listBox)
  );
}

/* ---------- Dialog: Neue Buchung / Bearbeiten ---------- */

function openBooking(tx) {
  const dlg = document.getElementById('dlg');
  let type = tx ? tx.type : 'expense';

  const amount = h('input', { type: 'text', id: 'f-amount', class: 'big', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00 €', value: tx ? fmtInput(tx.amount) : '' });
  const date = h('input', { type: 'date', id: 'f-date', value: tx ? tx.date : todayStr(), required: true });
  const cat = h('select', { id: 'f-cat' });
  const note = h('input', { type: 'text', id: 'f-note', autocomplete: 'off', value: tx ? tx.note || '' : '' });
  const err = h('div', { class: 'notice', role: 'alert' });

  const fillCats = (keep) => {
    const names = state.data.categories.filter((c) => c.type === type).map((c) => c.name);
    cat.replaceChildren(...names.map((n) => h('option', { value: n, selected: n === keep }, n)));
  };

  const expBtn = h('button', { type: 'button' }, 'Ausgabe');
  const incBtn = h('button', { type: 'button' }, 'Einnahme');
  const paintType = () => {
    expBtn.className = type === 'expense' ? 'on exp' : '';
    incBtn.className = type === 'income' ? 'on inc' : '';
    expBtn.setAttribute('aria-pressed', String(type === 'expense'));
    incBtn.setAttribute('aria-pressed', String(type === 'income'));
  };
  expBtn.addEventListener('click', () => { type = 'expense'; paintType(); fillCats(); });
  incBtn.addEventListener('click', () => { type = 'income'; paintType(); fillCats(); });
  paintType();
  fillCats(tx ? tx.category : undefined);

  const form = h('form', { class: 'dlg-form', novalidate: true },
    h('h2', { id: 'dlg-title' }, tx ? 'Buchung bearbeiten' : 'Neue Buchung'),
    h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Art der Buchung' }, expBtn, incBtn),
    h('label', { class: 'field' }, 'Betrag', amount),
    h('label', { class: 'field' }, 'Datum', date),
    h('label', { class: 'field' }, 'Kategorie', cat),
    h('label', { class: 'field' }, 'Beschreibung (optional)', note),
    err,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Speichern')
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cents = parseAmount(amount.value);
    if (cents == null) { err.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 42,18'; amount.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { err.textContent = 'Bitte ein Datum wählen.'; date.focus(); return; }
    if (!cat.value) { err.textContent = 'Bitte eine Kategorie wählen (unter „Kategorien“ kannst du neue anlegen).'; return; }

    const rec = { type, amount: cents, date: date.value, category: cat.value, note: note.value.trim() };
    if (tx) {
      Object.assign(tx, rec);
    } else {
      state.data.transactions.push({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), created: Date.now(), ...rec });
    }
    await persist();
    state.year = Number(rec.date.slice(0, 4));
    state.month = Number(rec.date.slice(5, 7)) - 1;
    dlg.close();
    render();
  });

  dlg.addEventListener('close', () => dlg.replaceChildren(), { once: true });
  dlg.replaceChildren(form);
  dlg.showModal();
  amount.focus();
}

/* ---------- Kategorien ---------- */

function categoriesView() {
  const column = (type, title) => {
    const input = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Neue Kategorie' });
    const msg = h('div', { class: 'notice', role: 'alert' });
    const list = h('div', {});

    // Monatsbudget (nur Ausgaben-Kategorien); leer oder 0 = kein Budget
    const budgetInput = (c) => {
      const inp = h('input', {
        type: 'text', class: 'budget-in', inputmode: 'decimal', autocomplete: 'off',
        placeholder: 'Budget/Monat', 'aria-label': `Monatsbudget für ${c.name}`,
        value: c.budget ? fmtInput(c.budget) : ''
      });
      inp.addEventListener('change', async () => {
        const v = inp.value.trim();
        if (v === '' || /^0+([.,]0+)?\s*€?$/.test(v)) {
          delete c.budget;
          inp.value = '';
        } else {
          const cents = parseAmount(v);
          if (cents == null) {
            msg.textContent = 'Bitte für das Budget einen gültigen Betrag eingeben, z. B. 300';
            inp.value = c.budget ? fmtInput(c.budget) : '';
            return;
          }
          c.budget = cents;
          inp.value = fmtInput(cents);
        }
        msg.textContent = '';
        await persist();
      });
      return inp;
    };

    const paint = () => {
      const cats = state.data.categories.filter((c) => c.type === type);
      list.replaceChildren(...cats.map((c) => {
        const used = state.data.transactions.filter((t) => t.type === type && t.category === c.name).length
          + (state.data.recurring || []).filter((r) => r.type === type && r.category === c.name).length;
        return h('div', { class: 'cat-row' },
          h('span', {}, c.name),
          type === 'expense' ? budgetInput(c) : null,
          h('span', { class: 'muted cnt' }, used ? `${used} ${used === 1 ? 'Buchung' : 'Buchungen'}` : ''),
          h('button', {
            type: 'button', class: 'icon-btn small',
            'aria-label': `Kategorie ${c.name} löschen`,
            disabled: used > 0,
            title: used > 0 ? 'Wird noch in Buchungen verwendet' : 'Löschen',
            onclick: async () => {
              state.data.categories = state.data.categories.filter((x) => x !== c);
              await persist();
              paint();
            }
          }, icon('trash', 16))
        );
      }));
    };

    const add = async () => {
      const name = input.value.trim();
      if (!name) return;
      if (state.data.categories.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
        msg.textContent = 'Diese Kategorie gibt es schon.';
        return;
      }
      msg.textContent = '';
      state.data.categories.push({ name, type });
      input.value = '';
      await persist();
      paint();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint();

    return h('section', { class: 'panel' },
      h('h2', {}, title),
      list,
      h('div', { class: 'add-row' },
        h('label', { class: 'field' }, 'Hinzufügen', input),
        h('button', { type: 'button', class: 'btn', onclick: add }, icon('plus', 16), 'Hinzufügen')
      ),
      msg
    );
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'head' }, h('h1', { class: 'title' }, 'Kategorien')),
    h('div', { class: 'muted' }, 'Bei Ausgaben kannst du ein Monatsbudget eintragen. Die Übersicht zeigt dann, wie viel davon schon verbraucht ist.'),
    h('div', { class: 'two-col' }, column('expense', 'Ausgaben'), column('income', 'Einnahmen'))
  );
}

/* ---------- Daueraufträge ---------- */

function recurringView() {
  const list = [...(state.data.recurring || [])].sort(
    (a, b) => (a.note || a.category).localeCompare(b.note || b.category, 'de')
  );

  const rows = list.map((r) => {
    const nd = r.active ? nextDue(r) : null;
    const nextText = !r.active ? 'pausiert' : nd ? longDate(nd) : 'beendet';
    return h('div', { class: 'row rec' },
      h('div', {}, r.note || r.category, r.note ? h('span', { class: 'muted' }, ' · ' + r.category) : null),
      h('div', { class: 'muted' }, INTERVALS[r.interval] || ''),
      h('div', { class: 'muted' }, nextText),
      amountEl(r),
      h('div', { class: 'actions' },
        h('button', {
          type: 'button', class: 'icon-btn small',
          'aria-label': r.active ? 'Dauerauftrag pausieren' : 'Dauerauftrag fortsetzen',
          title: r.active ? 'Pausieren' : 'Fortsetzen',
          onclick: async () => {
            r.active = !r.active;
            if (r.active) skipToNow(r);
            await persist();
            render();
          }
        }, icon(r.active ? 'pause' : 'play', 16)),
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Dauerauftrag bearbeiten', onclick: () => openRecurring(r) }, icon('edit', 16)),
        h('button', {
          type: 'button', class: 'icon-btn small', 'aria-label': 'Dauerauftrag löschen',
          onclick: async () => {
            if (!confirm('Diesen Dauerauftrag löschen? Bereits gebuchte Buchungen bleiben erhalten.')) return;
            state.data.recurring = state.data.recurring.filter((x) => x.id !== r.id);
            await persist();
            render();
          }
        }, icon('trash', 16))
      )
    );
  });

  const body = rows.length
    ? [
        h('div', { class: 'row rec head-row' }, h('div', {}, 'Beschreibung'), h('div', {}, 'Intervall'), h('div', {}, 'Nächste Buchung'), h('div', { class: 'right' }, 'Betrag'), h('div', {})),
        ...rows
      ]
    : [h('div', { class: 'empty' }, 'Noch keine Daueraufträge. Lege z. B. Miete oder Strom an, dann werden sie automatisch am Fälligkeitstag gebucht.')];

  return h('div', { class: 'stack' },
    h('div', { class: 'head' },
      h('h1', { class: 'title' }, 'Daueraufträge'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => openRecurring() }, icon('plus', 16), 'Neuer Dauerauftrag')
    ),
    h('section', { class: 'panel' }, ...body),
    h('div', { class: 'muted' }, 'Fällige Termine werden beim Start der App automatisch als normale Buchungen eingetragen (mit ↻-Symbol in der Buchungsliste) und lassen sich dort wie jede andere Buchung ändern oder löschen.')
  );
}

function openRecurring(rec) {
  const dlg = document.getElementById('dlg');
  let type = rec ? rec.type : 'expense';

  const amount = h('input', { type: 'text', id: 'r-amount', class: 'big', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00 €', value: rec ? fmtInput(rec.amount) : '' });
  const cat = h('select', { id: 'r-cat' });
  const note = h('input', { type: 'text', id: 'r-note', autocomplete: 'off', placeholder: 'z. B. Miete', value: rec ? rec.note || '' : '' });
  const interval = h('select', { id: 'r-int' },
    ...Object.entries(INTERVALS).map(([k, v]) => h('option', { value: k, selected: rec ? rec.interval === k : k === 'monthly' }, v)));
  const start = h('input', { type: 'date', id: 'r-start', value: rec ? rec.start : todayStr() });
  const end = h('input', { type: 'date', id: 'r-end', value: rec && rec.end ? rec.end : '' });
  const err = h('div', { class: 'notice', role: 'alert' });

  const fillCats = (keep) => {
    const names = state.data.categories.filter((c) => c.type === type).map((c) => c.name);
    cat.replaceChildren(...names.map((n) => h('option', { value: n, selected: n === keep }, n)));
  };
  const expBtn = h('button', { type: 'button' }, 'Ausgabe');
  const incBtn = h('button', { type: 'button' }, 'Einnahme');
  const paintType = () => {
    expBtn.className = type === 'expense' ? 'on exp' : '';
    incBtn.className = type === 'income' ? 'on inc' : '';
    expBtn.setAttribute('aria-pressed', String(type === 'expense'));
    incBtn.setAttribute('aria-pressed', String(type === 'income'));
  };
  expBtn.addEventListener('click', () => { type = 'expense'; paintType(); fillCats(); });
  incBtn.addEventListener('click', () => { type = 'income'; paintType(); fillCats(); });
  paintType();
  fillCats(rec ? rec.category : undefined);

  const form = h('form', { class: 'dlg-form', novalidate: true },
    h('h2', { id: 'dlg-title' }, rec ? 'Dauerauftrag bearbeiten' : 'Neuer Dauerauftrag'),
    h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Art der Buchung' }, expBtn, incBtn),
    h('label', { class: 'field' }, 'Betrag', amount),
    h('label', { class: 'field' }, 'Kategorie', cat),
    h('label', { class: 'field' }, 'Beschreibung', note),
    h('label', { class: 'field' }, 'Wiederholung', interval),
    h('div', { class: 'two-col' },
      h('label', { class: 'field' }, 'Erste Buchung am', start),
      h('label', { class: 'field' }, 'Endet am (optional)', end)
    ),
    h('div', { class: 'muted' }, 'Liegt der erste Termin in der Vergangenheit, werden die vergangenen Termine nachgebucht.'),
    err,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Speichern')
    )
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cents = parseAmount(amount.value);
    if (cents == null) { err.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 720,00'; amount.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start.value)) { err.textContent = 'Bitte das Datum der ersten Buchung wählen.'; start.focus(); return; }
    if (end.value && end.value < start.value) { err.textContent = 'Das Ende liegt vor der ersten Buchung.'; end.focus(); return; }
    if (!cat.value) { err.textContent = 'Bitte eine Kategorie wählen (unter „Kategorien“ kannst du neue anlegen).'; return; }

    const rec2 = { type, amount: cents, category: cat.value, note: note.value.trim(), interval: interval.value, start: start.value, end: end.value };
    if (rec) {
      Object.assign(rec, rec2);
    } else {
      if (!state.data.recurring) state.data.recurring = [];
      state.data.recurring.push({ id: uid(), active: true, last: '', ...rec2 });
    }
    runRecurring();
    await persist();
    dlg.close();
    render();
  });

  dlg.addEventListener('close', () => dlg.replaceChildren(), { once: true });
  dlg.replaceChildren(form);
  dlg.showModal();
  amount.focus();
}

/* ---------- Kontoauszug importieren (CSV) ---------- */

const IMPORT_MAX = 1500;
const cleanText = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

async function pickImportFile() {
  state.impError = '';
  let res;
  try {
    res = await window.api.importCsv();
  } catch (e) {
    state.impError = 'Die Datei konnte nicht geöffnet werden.';
    render();
    return;
  }
  if (!res) return;
  if (res.error) { state.impError = res.error; render(); return; }
  const imp = initImport(res.text, res.file);
  if (imp.error) { state.impError = imp.error; state.imp = null; } else state.imp = imp;
  render();
}

function initImport(text, file) {
  const delim = Importer.detectDelimiter(text);
  const table = Importer.parseCsv(text, delim);
  if (table.length < 2) return { error: 'In der Datei wurden keine Zeilen gefunden. Ist es ein CSV-Export aus dem Online-Banking?' };
  const headerIdx = Importer.findHeader(table);
  const firstCat = (type) => { const c = state.data.categories.find((x) => x.type === type); return c ? c.name : ''; };
  const imp = {
    file, delim, table, headerIdx,
    mapping: Importer.guessMapping(table[headerIdx]),
    invert: false, defExp: firstCat('expense'), defInc: firstCat('income'),
    items: [], skipped: 0, total: 0, tooMany: false
  };
  rebuildImport(imp);
  return imp;
}

// Baut die Buchungsvorschau neu auf: Duplikate erkennen, Kategorien aus früheren Buchungen übernehmen
function rebuildImport(imp) {
  const r = Importer.buildItems(imp.table, imp.headerIdx, imp.mapping, { invert: imp.invert });
  imp.skipped = r.skipped;
  imp.total = r.items.length;
  imp.tooMany = r.items.length > IMPORT_MAX;
  const items = imp.tooMany ? [] : r.items;

  const existing = new Map();
  const known = new Map();
  for (const t of [...state.data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = [t.date, t.type, t.amount, (t.note || '').toLowerCase()].join('|');
    existing.set(k, (existing.get(k) || 0) + 1);
    if (t.note) known.set(t.type + '|' + t.note.toLowerCase(), t.category);
  }
  for (const it of items) {
    const k = [it.date, it.type, it.amount, it.note.toLowerCase()].join('|');
    const n = existing.get(k) || 0;
    it.dup = n > 0;
    if (n > 0) existing.set(k, n - 1);
    it.selected = !it.dup;
    const learned = known.get(it.type + '|' + it.note.toLowerCase());
    it.auto = !!learned && state.data.categories.some((c) => c.type === it.type && c.name === learned);
    it.category = it.auto ? learned : (it.type === 'expense' ? imp.defExp : imp.defInc);
  }
  imp.items = items;
}

function importView() {
  const imp = state.imp;
  const cancel = () => { state.imp = null; state.impError = ''; state.view = 'bookings'; render(); };
  const head = h('div', { class: 'head' },
    h('h1', { class: 'title' }, 'Kontoauszug importieren'),
    h('button', { type: 'button', class: 'btn', onclick: cancel }, 'Abbrechen')
  );

  if (!imp) {
    return h('div', { class: 'stack' }, head,
      h('section', { class: 'panel' },
        h('h2', {}, 'CSV-Datei aus dem Online-Banking'),
        h('div', {}, 'Exportiere deine Umsätze im Online-Banking als CSV-Datei (meist unter „Umsätze“ bzw. „Kontoumsätze“ mit „Exportieren“ oder „Download“) und wähle sie hier aus. Du siehst danach eine Vorschau und kannst alles prüfen, bevor etwas gebucht wird.'),
        h('div', { class: 'muted' }, 'Bereits vorhandene Buchungen (gleiches Datum, gleicher Betrag, gleiche Beschreibung) werden erkannt und nicht doppelt gebucht. Kategorien, die du schon einmal zu einer Beschreibung gewählt hast, werden vorgeschlagen.'),
        state.impError ? h('div', { class: 'notice', role: 'alert' }, state.impError) : null,
        h('div', { class: 'filters' },
          h('button', { type: 'button', class: 'btn primary', onclick: pickImportFile }, 'CSV-Datei auswählen …')
        )
      )
    );
  }

  const hdr = () => imp.table[imp.headerIdx];

  // --- Spaltenzuordnung ---
  const sHeader = h('select', { id: 'imp-header' });
  const sDate = h('select', { id: 'imp-date' });
  const sAmount = h('select', { id: 'imp-amount' });
  const sDesc1 = h('select', { id: 'imp-desc1' });
  const sDesc2 = h('select', { id: 'imp-desc2' });
  const invert = h('input', { type: 'checkbox', id: 'imp-invert' });
  const sDefExp = h('select', { id: 'imp-defexp' });
  const sDefInc = h('select', { id: 'imp-definc' });
  const extra = h('div', { class: 'muted' });

  const fillCols = (sel, value, allowNone) => {
    const opts = [];
    if (allowNone) opts.push(h('option', { value: '-1' }, '— keine —'));
    else if (value < 0) opts.push(h('option', { value: '-1' }, '— bitte wählen —'));
    hdr().forEach((c, i) => opts.push(h('option', { value: String(i) }, `${i + 1}: ${cleanText(c) || '(leer)'}`)));
    sel.replaceChildren(...opts);
    sel.value = String(value);
  };
  const fillCats = (sel, type, value) => {
    const names = state.data.categories.filter((c) => c.type === type).map((c) => c.name);
    sel.replaceChildren(...names.map((n) => h('option', { value: n }, n)));
    if (value) sel.value = value;
  };
  const paintMapping = () => {
    const m = imp.mapping;
    const hdrOpts = [];
    for (let i = 0; i < Math.min(imp.table.length, 40); i++) {
      const label = imp.table[i].slice(0, 3).map(cleanText).join(' | ');
      hdrOpts.push(h('option', { value: String(i) }, `Zeile ${i + 1}: ${label.length > 70 ? label.slice(0, 67) + '…' : label}`));
    }
    sHeader.replaceChildren(...hdrOpts);
    sHeader.value = String(imp.headerIdx);
    fillCols(sDate, m.date, false);
    fillCols(sAmount, m.amount, false);
    fillCols(sDesc1, m.desc1, true);
    fillCols(sDesc2, m.desc2, true);
    invert.checked = imp.invert;
    const notes = [];
    if (m.amountIn >= 0) notes.push(`Einnahmen werden aus der Spalte „${cleanText(hdr()[m.amountIn])}“ gelesen.`);
    if (m.desc1In >= 0) notes.push(`Bei Einnahmen wird die Spalte „${cleanText(hdr()[m.desc1In])}“ als Beschreibung verwendet.`);
    extra.textContent = notes.join(' ');
  };
  fillCats(sDefExp, 'expense', imp.defExp);
  fillCats(sDefInc, 'income', imp.defInc);

  // --- Vorschau ---
  const summary = h('div', { class: 'muted', role: 'status' });
  const listBox = h('div', { class: 'imp-list' });
  const importBtn = h('button', { type: 'button', class: 'btn primary' }, 'Importieren');
  const noteMissing = h('div', { class: 'notice', role: 'alert' });

  const paintSummary = () => {
    const chosen = imp.items.filter((i) => i.selected);
    const dups = imp.items.filter((i) => i.dup).length;
    if (imp.tooMany) {
      summary.textContent = `Die Datei enthält ${imp.total} Buchungen, mehr als ${IMPORT_MAX} auf einmal. Bitte exportiere kürzere Zeiträume (z. B. ein Quartal) und importiere sie nacheinander.`;
    } else if (!imp.items.length) {
      summary.textContent = 'Es wurden keine Buchungen erkannt. Prüfe oben die Kopfzeile und die Spalten.' + (imp.skipped ? ` (${imp.skipped} Zeilen nicht lesbar)` : '');
    } else {
      summary.textContent = `${imp.items.length} Buchungen erkannt · ${chosen.length} ausgewählt` +
        (dups ? ` · ${dups} schon vorhanden` : '') + (imp.skipped ? ` · ${imp.skipped} Zeilen nicht lesbar` : '');
    }
    const missing = chosen.some((i) => !i.category);
    noteMissing.textContent = missing ? 'Für manche Buchungen fehlt eine Kategorie. Lege unter „Kategorien“ passende an.' : '';
    importBtn.textContent = `${chosen.length} ${chosen.length === 1 ? 'Buchung' : 'Buchungen'} importieren`;
    importBtn.disabled = chosen.length === 0 || missing;
  };

  const paintList = () => {
    if (!imp.items.length) { listBox.replaceChildren(); paintSummary(); return; }
    const all = h('input', { type: 'checkbox', 'aria-label': 'Alle auswählen', checked: imp.items.every((i) => i.selected) });
    all.addEventListener('change', () => { imp.items.forEach((i) => { i.selected = all.checked; }); paintList(); });
    const rows = imp.items.map((it) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': `Buchung vom ${longDate(it.date)} übernehmen`, checked: it.selected });
      cb.addEventListener('change', () => { it.selected = cb.checked; paintSummary(); });
      const sel = h('select', { 'aria-label': `Kategorie für ${it.note || 'Buchung'}` });
      sel.replaceChildren(...state.data.categories.filter((c) => c.type === it.type).map((c) => h('option', { value: c.name }, c.name)));
      if (it.category) sel.value = it.category;
      sel.addEventListener('change', () => { it.category = sel.value; it.manual = true; paintSummary(); });
      return h('div', { class: 'row imp' },
        h('div', {}, cb),
        h('div', { class: 'muted' }, longDate(it.date)),
        h('div', { title: it.note }, it.note || '—', it.dup ? h('span', { class: 'tag' }, 'schon vorhanden') : null),
        h('div', {}, sel),
        amountEl(it)
      );
    });
    listBox.replaceChildren(
      h('div', { class: 'row imp head-row' }, h('div', {}, all), h('div', {}, 'Datum'), h('div', {}, 'Beschreibung'), h('div', {}, 'Kategorie'), h('div', { class: 'right' }, 'Betrag')),
      ...rows
    );
    paintSummary();
  };

  // --- Änderungen an der Zuordnung ---
  const remap = () => { rebuildImport(imp); paintList(); };
  sHeader.addEventListener('change', () => {
    imp.headerIdx = Number(sHeader.value);
    imp.mapping = Importer.guessMapping(hdr());
    paintMapping();
    remap();
  });
  sDate.addEventListener('change', () => { imp.mapping.date = Number(sDate.value); remap(); });
  sAmount.addEventListener('change', () => { imp.mapping.amount = Number(sAmount.value); imp.mapping.amountIn = -1; paintMapping(); remap(); });
  sDesc1.addEventListener('change', () => { imp.mapping.desc1 = Number(sDesc1.value); imp.mapping.desc1In = -1; paintMapping(); remap(); });
  sDesc2.addEventListener('change', () => { imp.mapping.desc2 = Number(sDesc2.value); remap(); });
  invert.addEventListener('change', () => { imp.invert = invert.checked; remap(); });
  const defChange = (type, sel) => {
    const key = type === 'expense' ? 'defExp' : 'defInc';
    imp[key] = sel.value;
    imp.items.forEach((i) => { if (i.type === type && !i.auto && !i.manual) i.category = sel.value; });
    paintList();
  };
  sDefExp.addEventListener('change', () => defChange('expense', sDefExp));
  sDefInc.addEventListener('change', () => defChange('income', sDefInc));

  importBtn.addEventListener('click', async () => {
    const chosen = imp.items.filter((i) => i.selected && i.category);
    if (!chosen.length) return;
    const base = Date.now();
    chosen.forEach((it, idx) => {
      state.data.transactions.push({ id: uid(), created: base + idx, type: it.type, amount: it.amount, date: it.date, category: it.category, note: it.note });
    });
    await persist();
    state.flash = `${chosen.length} ${chosen.length === 1 ? 'Buchung' : 'Buchungen'} aus „${imp.file}“ importiert.`;
    state.imp = null;
    state.view = 'bookings';
    state.bf = { year: 'all', month: 'all', q: '' };
    render();
  });

  paintMapping();
  paintList();

  const field = (label, el) => h('label', { class: 'field' }, label, el);
  return h('div', { class: 'stack' }, head,
    h('section', { class: 'panel' },
      h('h2', {}, `Spalten zuordnen · ${imp.file}`),
      h('div', { class: 'muted' }, 'Die Zuordnung wurde automatisch erkannt. Prüfe sie kurz und ändere sie bei Bedarf.'),
      h('div', { class: 'imp-map' },
        field('Kopfzeile', sHeader),
        field('Datum', sDate),
        field('Betrag', sAmount),
        field('Beschreibung', sDesc1),
        field('Zusatztext (optional)', sDesc2),
        field('Standard-Kategorie Ausgaben', sDefExp),
        field('Standard-Kategorie Einnahmen', sDefInc)
      ),
      h('label', { class: 'check' }, invert, 'Vorzeichen umkehren (Ausgaben sind in der Datei positiv, z. B. bei Kreditkarten)'),
      extra
    ),
    h('section', { class: 'panel' },
      h('h2', {}, 'Vorschau'),
      summary,
      listBox,
      noteMissing,
      h('div', { class: 'filters' }, importBtn)
    )
  );
}

/* ---------- Einstellungen ---------- */

function csvCell(v) {
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv() {
  const rows = [...state.data.transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  const lines = ['Datum;Art;Kategorie;Beschreibung;Betrag'];
  for (const t of rows) {
    const betrag = (t.type === 'income' ? '' : '-') + (t.amount / 100).toFixed(2).replace('.', ',');
    lines.push([longDate(t.date), t.type === 'income' ? 'Einnahme' : 'Ausgabe', t.category, t.note || '', betrag].map(csvCell).join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}

function backupPanel() {
  const msg = h('div', { class: 'muted', role: 'status' }, state.flash || '');
  state.flash = '';
  const say = (text, bad) => { msg.textContent = text; msg.className = bad ? 'notice' : 'muted'; };
  const errText = (e) => (e && e.message ? e.message : String(e));

  const doBackup = async () => {
    try {
      const p = await window.api.backup(state.data);
      if (p) say(`Sicherung gespeichert: ${p}`);
    } catch (e) {
      say('Sicherung fehlgeschlagen: ' + errText(e), true);
    }
  };

  const doRestore = async () => {
    let res;
    try {
      res = await window.api.restore();
    } catch (e) {
      say('Wiederherstellen fehlgeschlagen: ' + errText(e), true);
      return;
    }
    if (!res) return;
    if (res.error) { say(res.error, true); return; }

    const d = res.data;
    const when = res.exportedAt && !isNaN(new Date(res.exportedAt)) ? ` vom ${new Date(res.exportedAt).toLocaleDateString('de-DE')}` : '';
    const ok = confirm(
      `Sicherung${when} wiederherstellen?\n\n` +
      `Die Sicherung enthält ${d.transactions.length} Buchungen und ${(d.recurring || []).length} Daueraufträge. ` +
      `Deine aktuellen Daten (${state.data.transactions.length} Buchungen) werden dadurch ersetzt. ` +
      'Vorher wird automatisch eine Kopie der aktuellen Daten im Datenordner abgelegt.'
    );
    if (!ok) return;

    try {
      await window.api.safetyCopy();
      if (!Array.isArray(d.recurring)) d.recurring = [];
      state.data = d;
      runRecurring();
      state.bf = { year: 'all', month: 'all', q: '' };
      await persist();
      state.flash = 'Sicherung wiederhergestellt.';
      render();
    } catch (e) {
      say('Wiederherstellen fehlgeschlagen: ' + errText(e), true);
    }
  };

  return h('section', { class: 'panel' },
    h('h2', {}, 'Sicherung'),
    h('div', { class: 'muted' }, 'Speichere alle Buchungen, Kategorien und Daueraufträge in einer Datei, z. B. auf einem USB-Stick oder in der Cloud. Mit dieser Datei kannst du sie jederzeit wiederherstellen, auch auf einem anderen Rechner (Windows oder Mac).'),
    h('div', { class: 'filters' },
      h('button', { type: 'button', class: 'btn primary', onclick: doBackup }, 'Sicherung speichern …'),
      h('button', { type: 'button', class: 'btn', onclick: doRestore }, 'Sicherung wiederherstellen …')
    ),
    msg
  );
}

function settingsView() {
  const msg = h('div', { class: 'muted', role: 'status' });

  const op = state.data.opening;
  const opAmount = h('input', { type: 'text', id: 'op-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00 €', value: op ? fmtInput(op.amount) : '' });
  const opMonth = h('input', { type: 'month', id: 'op-month', value: op && op.month ? op.month : `${now.getFullYear()}-${pad(now.getMonth() + 1)}` });
  const opMsg = h('div', { class: 'notice', role: 'status' });
  const saveOpening = async () => {
    const cents = parseSigned(opAmount.value);
    if (cents == null) { opMsg.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 1.250,00'; return; }
    if (!/^\d{4}-\d{2}$/.test(opMonth.value)) { opMsg.textContent = 'Bitte einen Monat wählen.'; return; }
    state.data.opening = { amount: cents, month: opMonth.value };
    await persist();
    opMsg.textContent = 'Gespeichert. Der Übertrag in der Übersicht ist angepasst.';
  };
  const clearOpening = async () => {
    delete state.data.opening;
    await persist();
    render();
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'head' }, h('h1', { class: 'title' }, 'Einstellungen')),
    h('section', { class: 'panel' },
      h('h2', {}, 'Anfangsbestand'),
      h('div', { class: 'muted' }, 'Optional: Dein Kontostand zu Beginn eines Monats. Von da an wird der Saldo jeden Monat in den nächsten übernommen. Ohne Anfangsbestand startet die Rechnung bei 0 € mit deiner ersten Buchung.'),
      h('div', { class: 'filters' },
        h('label', { class: 'field' }, 'Kontostand', opAmount),
        h('label', { class: 'field' }, 'zu Beginn von', opMonth),
        h('button', { type: 'button', class: 'btn primary', onclick: saveOpening }, 'Speichern'),
        op ? h('button', { type: 'button', class: 'btn', onclick: clearOpening }, 'Entfernen') : null
      ),
      opMsg
    ),
    backupPanel(),
    h('section', { class: 'panel' },
      h('h2', {}, 'Deine Daten'),
      h('div', { class: 'muted' }, 'Alle Buchungen liegen in dieser Datei auf deinem Rechner. Für ein Backup reicht es, sie zu kopieren:'),
      h('div', {}, h('code', {}, state.file)),
      h('div', { class: 'filters' },
        h('button', { type: 'button', class: 'btn', onclick: () => window.api.reveal() }, 'Im Ordner anzeigen'),
        h('button', {
          type: 'button', class: 'btn',
          onclick: async () => {
            const p = await window.api.exportCsv(buildCsv());
            msg.textContent = p ? `Exportiert nach ${p}` : '';
          }
        }, 'Als CSV exportieren (Excel)')
      ),
      msg
    ),
    updatePanel()
  );
}

/* ---------- Updates ---------- */

const fmtSize = (bytes) => bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const UPDATE_KINDS = {
  'win-small': { button: 'Jetzt aktualisieren', ask: 'Das Update wird heruntergeladen und gestartet. Windows fragt nach der Erlaubnis, danach wird das Haushaltsbuch beendet. Fortfahren?' },
  'win-full': { button: 'Setup herunterladen und installieren', ask: 'Diese Version braucht das vollständige Setup. Es wird heruntergeladen und gestartet, danach wird das Haushaltsbuch beendet. Fortfahren?' },
  'mac-small': { button: 'Jetzt aktualisieren', ask: 'Das Update wird heruntergeladen und eingespielt, danach startet das Haushaltsbuch neu. Fortfahren?' },
  'linux-appimage': { button: 'Jetzt aktualisieren', ask: 'Die neue Version wird heruntergeladen und ersetzt die bisherige AppImage-Datei, danach startet das Haushaltsbuch neu. Fortfahren?' },
  page: { button: 'Download-Seite öffnen', ask: '' }
};

function updateStatusText(u) {
  if (!u) return '';
  if (u.status === 'checking') return 'Suche nach Updates …';
  if (u.status === 'current') return 'Du hast die neueste Version.';
  if (u.status === 'error') return `Die Suche hat nicht geklappt: ${u.message}`;
  if (u.status === 'available') {
    if (u.kind === 'page') return `Version ${u.latest} ist verfügbar. Für diesen Rechner gibt es kein automatisches Update, die Datei bekommst du auf der Download-Seite.`;
    return `Version ${u.latest} ist verfügbar.`;
  }
  return '';
}

function updatePanel() {
  if (!window.api.updateCheck) return null;
  const u = state.update;
  const bad = state.updateMsg ? state.updateMsgBad : (u && u.status === 'error');
  const status = h('div', { id: 'upd-status', class: bad ? 'notice' : 'muted', role: 'status' }, state.updateMsg || updateStatusText(u));

  const check = async () => {
    state.update = { status: 'checking' };
    state.updateMsg = '';
    state.updateMsgBad = false;
    render();
    state.update = await window.api.updateCheck(true);
    render();
  };

  const install = async () => {
    const kind = UPDATE_KINDS[u.kind] || UPDATE_KINDS.page;
    if (kind.ask && !confirm(kind.ask)) return;
    const el = () => document.getElementById('upd-status');
    const show = (t, bad) => { state.updateMsg = t; state.updateMsgBad = !!bad; const e = el(); if (e) { e.textContent = t; e.className = bad ? 'notice' : 'muted'; } };
    state.updateBusy = true;
    render();
    show('Lade herunter …');
    const off = window.api.onUpdateProgress ? window.api.onUpdateProgress((p) => show(`Lade herunter … ${p} %`)) : () => {};
    let res;
    try {
      res = await window.api.updateInstall();
    } finally {
      off();
    }
    state.updateBusy = false;
    if (!res || res.error) show(`Das Update hat nicht geklappt: ${res ? res.error : 'keine Antwort'} Deine Version bleibt unverändert.`, true);
    else if (res.status === 'launched') show('Das Update-Programm startet. Das Haushaltsbuch wird jetzt beendet …');
    else if (res.status === 'restarting') show('Update eingespielt. Das Haushaltsbuch startet neu …');
    else if (res.status === 'page') show('Die Download-Seite wurde im Browser geöffnet.');
    render();
  };

  const auto = h('input', {
    type: 'checkbox', id: 'upd-auto',
    onchange: async (e) => { state.updateAuto = await window.api.updateSetAuto(e.target.checked); }
  });
  auto.checked = state.updateAuto !== false;

  const available = u && u.status === 'available';
  const kind = available ? (UPDATE_KINDS[u.kind] || UPDATE_KINDS.page) : null;
  const size = available && u.asset && u.asset.size ? ` (${fmtSize(u.asset.size)})` : '';

  return h('section', { class: 'panel' },
    h('h2', {}, 'Updates'),
    h('div', { class: 'muted version' }, `Installiert: Haushaltsbuch ${state.version || '?'}`),
    h('label', { class: 'check' }, auto, 'Beim Start automatisch nach Updates suchen (höchstens einmal am Tag, fragt nur GitHub)'),
    available && u.notes ? h('div', { class: 'notes' }, h('div', { class: 'notes-title' }, `Neu in ${u.latest}:`), h('div', { class: 'notes-text' }, u.notes)) : null,
    h('div', { class: 'filters' },
      available
        ? h('button', { type: 'button', class: 'btn primary', id: 'upd-install', disabled: state.updateBusy, onclick: install }, icon('download'), kind.button + size)
        : null,
      available && u.kind !== 'page'
        ? h('button', { type: 'button', class: 'btn', disabled: state.updateBusy, onclick: () => window.api.updateOpenPage() }, 'Auf GitHub ansehen')
        : null,
      h('button', { type: 'button', class: 'btn', id: 'upd-check', disabled: state.updateBusy || (u && u.status === 'checking'), onclick: check }, 'Jetzt nach Updates suchen')
    ),
    status
  );
}

async function checkUpdatesOnStart() {
  if (!window.api.updateCheck) return;
  try {
    const s = await window.api.updateSettings();
    state.updateAuto = s.auto;
    const res = await window.api.updateCheck(false);
    if (res && res.status === 'available') {
      state.update = res;
      if (state.view === 'settings') render(); else renderNav();
    }
  } catch (e) { /* ohne Internet einfach nichts anzeigen */ }
}

/* ---------- Start ---------- */

async function init() {
  const res = await window.api.load();
  if (res.error) {
    renderNav();
    document.getElementById('main').replaceChildren(
      h('div', { class: 'stack' },
        h('h1', { class: 'title' }, 'Die Datendatei konnte nicht gelesen werden'),
        h('p', {}, res.error),
        h('p', {}, 'Die Datei wurde nicht verändert und liegt hier:'),
        h('div', {}, h('code', {}, res.file || ''))
      )
    );
    return;
  }
  state.data = res.data;
  state.file = res.file;
  state.version = res.version || '';
  if (!Array.isArray(state.data.recurring)) state.data.recurring = [];
  if (runRecurring()) await persist();
  render();
  checkUpdatesOnStart();

  // Läuft die App über Mitternacht, werden neu fällige Termine beim Zurückkehren gebucht
  window.addEventListener('focus', async () => {
    if (document.getElementById('dlg').open) return;
    if (runRecurring()) { await persist(); render(); }
  });
}

init();
