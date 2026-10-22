'use strict';
// CSV-Import für Kontoauszüge: Zeichensatz, Trennzeichen, Kopfzeile, Spalten, Datum und Beträge erkennen.
// Läuft im Hauptprozess (decodeBuffer) und in der Oberfläche (alles andere).

(function (root) {
  const norm = (s) => String(s == null ? '' : s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

  // UTF-8 (mit/ohne BOM), UTF-16 oder - wie bei vielen Banken - Windows-1252
  function decodeBuffer(buf) {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf).replace(/^﻿/, '');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
    } catch (e) {
      return new TextDecoder('windows-1252').decode(buf);
    }
  }

  function parseCsv(text, delim) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else cell += c;
      } else if (c === '"' && cell === '') {
        inQ = true;
      } else if (c === delim) {
        row.push(cell); cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }

  function detectDelimiter(text) {
    const sample = text.slice(0, 20000);
    let best = ';';
    let bestScore = -1;
    for (const d of [';', '\t', ',', '|']) {
      const rows = parseCsv(sample, d).slice(0, 40);
      const counts = new Map();
      for (const r of rows) counts.set(r.length, (counts.get(r.length) || 0) + 1);
      let score = 0;
      for (const [len, n] of counts) if (len > 1) score = Math.max(score, (len - 1) * n);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  const DATE_KEYS = ['buchungstag', 'buchungsdatum', 'datum', 'date', 'valuta', 'wertstellung'];
  const AMOUNT_KEYS = ['betrag', 'umsatz', 'amount'];
  const PARTY_OUT_KEYS = ['empfaenger', 'zahlungsempfaenger', 'beguenstigter', 'payee'];
  const PARTY_IN_KEYS = ['auftraggeber', 'zahlungspflichtiger', 'zahlungspflichtige'];
  const TEXT_KEYS = ['verwendungszweck', 'buchungstext', 'beschreibung', 'description', 'memo', 'text'];

  // Je Suchwort erst Spalten, die so beginnen ("Betrag (€)"), dann solche, die es nur enthalten
  // ("Lastschrift Ursprungsbetrag" soll nicht vor "Betrag" gewinnen).
  const findCol = (norms, keys, exclude) => {
    const ok = (idx) => !(exclude && exclude.includes(idx));
    for (const k of keys) {
      let i = norms.findIndex((n, idx) => n && n.startsWith(k) && ok(idx));
      if (i < 0) i = norms.findIndex((n, idx) => n && n.includes(k) && ok(idx));
      if (i >= 0) return i;
    }
    return -1;
  };

  // Welche Zeile ist die Kopfzeile? (manche Banken schreiben vorher Kontoinformationen)
  function findHeader(rows) {
    let best = 0;
    let bestScore = 0;
    const limit = Math.min(rows.length, 40);
    for (let i = 0; i < limit; i++) {
      const norms = rows[i].map(norm);
      if (norms.length < 3) continue;
      let score = 0;
      if (findCol(norms, DATE_KEYS) >= 0 || norms.includes('buchung')) score += 2;
      if (findCol(norms, AMOUNT_KEYS) >= 0 || (norms.includes('soll') && norms.includes('haben'))) score += 2;
      if (findCol(norms, TEXT_KEYS.concat(PARTY_OUT_KEYS, PARTY_IN_KEYS)) >= 0) score += 1;
      if (score > bestScore) { bestScore = score; best = i; }
      if (score >= 5) break;
    }
    return best;
  }

  // Vorschlag, welche Spalte was enthält. -1 = nicht gefunden.
  function guessMapping(headerRow) {
    const norms = headerRow.map(norm);
    const m = { date: -1, amount: -1, amountIn: -1, desc1: -1, desc1In: -1, desc2: -1 };

    m.date = findCol(norms, DATE_KEYS);
    if (m.date < 0) m.date = norms.indexOf('buchung');

    m.amount = findCol(norms, AMOUNT_KEYS);
    if (m.amount < 0) {
      const soll = norms.indexOf('soll');
      const haben = norms.indexOf('haben');
      if (soll >= 0 && haben >= 0) { m.amount = soll; m.amountIn = haben; }
    }

    const used = [m.date, m.amount, m.amountIn];
    const out = findCol(norms, PARTY_OUT_KEYS, used);
    const inn = findCol(norms, PARTY_IN_KEYS, used);
    const combined = norms.findIndex((n) => /empfaenger|beguenstigter|payee/.test(n) && /auftraggeber|zahlungspflichtiger/.test(n));
    if (combined >= 0) m.desc1 = combined;
    else if (out >= 0 && inn >= 0 && out !== inn) { m.desc1 = out; m.desc1In = inn; }
    else m.desc1 = out >= 0 ? out : inn;
    // ING: "Auftraggeber/Empfänger" steht in einer Spalte -> wird oben als combined erkannt

    const taken = used.concat([m.desc1, m.desc1In]);
    m.desc2 = findCol(norms, TEXT_KEYS, taken);
    if (m.desc1 < 0 && m.desc2 >= 0) { m.desc1 = m.desc2; m.desc2 = findCol(norms, TEXT_KEYS, taken.concat([m.desc1])); }
    return m;
  }

  function parseDate(raw) {
    const s = String(raw == null ? '' : raw).trim();
    let d; let mo; let y;
    let m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4}|\d{2})(?!\d)/.exec(s);
    if (m) {
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (m[3].length === 2) y += y <= 69 ? 2000 : 1900;
    } else {
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s);
      if (!m) return null;
      y = +m[1]; mo = +m[2]; d = +m[3];
    }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Liefert Cent mit Vorzeichen oder null. Versteht 1.234,56 / -12,30 / 12,30- / 1,234.56 / 12.30 / "12,30 S"
  function parseAmount(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/€|EUR/gi, '').replace(/\s+/g, '');
    if (!s) return null;
    let neg = false;
    const sh = /^(.*\d)([SH])$/i.exec(s);
    if (sh) { neg = sh[2].toUpperCase() === 'S'; s = sh[1]; }
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^[-−]/.test(s)) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
    if (/[-−]$/.test(s)) { neg = !neg; s = s.slice(0, -1); } else if (s.endsWith('+')) s = s.slice(0, -1);
    if (!/^[\d.,]+$/.test(s)) return null;

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
      const thou = dec === '.' ? ',' : '.';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (hasComma) {
      // "12,30" = Dezimalkomma; "1,234,567" = Tausendertrennung; "12,345" ist mehrdeutig und wird abgelehnt
      if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
      else if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.split(',').join('');
      else return null;
    } else if (hasDot) {
      // "12.30" = Dezimalpunkt; "1.234.567" = Tausendertrennung; "1.234" ist mehrdeutig und wird abgelehnt
      if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.split('.').join('');
      else if (!/^\d+\.\d{1,2}$/.test(s)) return null;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const cents = Math.round(parseFloat(s) * 100);
    return neg ? -cents : cents;
  }

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // Wandelt die Tabelle in Buchungen um. skipped = Zeilen, die wie Daten aussehen, aber nicht lesbar waren.
  function buildItems(table, headerIdx, m, opts) {
    const invert = !!(opts && opts.invert);
    const headerCols = table[headerIdx] ? table[headerIdx].length : 0;
    const minCols = Math.max(2, headerCols - 2);
    const items = [];
    let skipped = 0;
    const cell = (row, i) => (i >= 0 && i < row.length ? row[i] : '');

    for (let r = headerIdx + 1; r < table.length; r++) {
      const row = table[r];
      if (row.length < minCols) continue; // Kontoinformationen, Fußzeilen u. ä.
      const date = parseDate(cell(row, m.date));
      let cents = parseAmount(cell(row, m.amount));
      if (m.amountIn >= 0) {
        // getrennte Spalten Soll/Haben: Soll = Ausgabe, Haben = Einnahme
        const soll = parseAmount(cell(row, m.amount));
        const haben = parseAmount(cell(row, m.amountIn));
        if (haben != null && haben !== 0) cents = Math.abs(haben);
        else if (soll != null && soll !== 0) cents = -Math.abs(soll);
        else cents = null;
      }
      if (date == null || cents == null || cents === 0) { skipped++; continue; }
      if (invert) cents = -cents;
      const income = cents > 0;

      const party = clean(income && m.desc1In >= 0 && clean(cell(row, m.desc1In)) ? cell(row, m.desc1In) : cell(row, m.desc1))
        || clean(cell(row, m.desc1In));
      const text = clean(cell(row, m.desc2));
      const parts = [];
      if (party) parts.push(party);
      if (text && text.toLowerCase() !== party.toLowerCase()) parts.push(text);
      let note = parts.join(' – ');
      if (note.length > 120) note = note.slice(0, 117) + '…';

      items.push({ line: r + 1, date, type: income ? 'income' : 'expense', amount: Math.abs(cents), note });
    }
    return { items, skipped };
  }

  const api = { decodeBuffer, parseCsv, detectDelimiter, findHeader, guessMapping, parseDate, parseAmount, buildItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Importer = api;
})(typeof window !== 'undefined' ? window : globalThis);
