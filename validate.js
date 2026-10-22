'use strict';
// Prüft Haushaltsbuch-Daten (z. B. aus einer Sicherungsdatei), bevor sie übernommen werden.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const INTERVALS = ['monthly', 'quarterly', 'yearly'];

const isStr = (v) => typeof v === 'string';
const isType = (v) => v === 'income' || v === 'expense';
const isCents = (v) => Number.isInteger(v) && v > 0 && v < 1e12;
const isOptDate = (v) => v == null || v === '' || (isStr(v) && DATE.test(v));

// Gibt eine Fehlermeldung zurück oder null, wenn alles in Ordnung ist.
function checkData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'Die Datei enthält keine Haushaltsbuch-Daten.';
  if (!Array.isArray(d.categories) || !Array.isArray(d.transactions)) return 'Die Datei enthält keine Haushaltsbuch-Daten.';

  for (const c of d.categories) {
    if (!c || !isStr(c.name) || !c.name.trim() || !isType(c.type)) return 'Die Sicherung ist beschädigt (ungültige Kategorie).';
    if (c.budget != null && !(Number.isInteger(c.budget) && c.budget > 0 && c.budget < 1e12)) return 'Die Sicherung ist beschädigt (ungültiges Budget).';
  }
  for (const t of d.transactions) {
    if (!t || !isStr(t.id) || !isType(t.type) || !isCents(t.amount) || !isStr(t.date) || !DATE.test(t.date) || !isStr(t.category)) {
      return 'Die Sicherung ist beschädigt (ungültige Buchung).';
    }
    if (t.note != null && !isStr(t.note)) return 'Die Sicherung ist beschädigt (ungültige Buchung).';
  }
  if (d.recurring != null) {
    if (!Array.isArray(d.recurring)) return 'Die Sicherung ist beschädigt (ungültige Daueraufträge).';
    for (const r of d.recurring) {
      if (!r || !isStr(r.id) || !isType(r.type) || !isCents(r.amount) || !isStr(r.category) ||
          !INTERVALS.includes(r.interval) || !isStr(r.start) || !DATE.test(r.start) ||
          !isOptDate(r.end) || !isOptDate(r.last) || (r.note != null && !isStr(r.note))) {
        return 'Die Sicherung ist beschädigt (ungültiger Dauerauftrag).';
      }
    }
  }
  if (d.opening != null) {
    const o = d.opening;
    if (typeof o !== 'object' || !Number.isInteger(o.amount) || !isStr(o.month) || !MONTH.test(o.month)) {
      return 'Die Sicherung ist beschädigt (ungültiger Anfangsbestand).';
    }
  }
  return null;
}

// Sicherungsdateien haben einen Rahmen { app, exportedAt, data }; die rohe Datendatei wird auch akzeptiert.
function extract(parsed) {
  if (parsed && typeof parsed === 'object' && parsed.app === 'haushaltsbuch' && parsed.data) return parsed.data;
  return parsed;
}

module.exports = { checkData, extract };
