const assert = require('assert');
const I = require('../importer.js');

// Beträge
const a = I.parseAmount;
assert.strictEqual(a('1.234,56'), 123456);
assert.strictEqual(a('-12,30'), -1230);
assert.strictEqual(a('12,30-'), -1230);
assert.strictEqual(a('+2.450,00'), 245000);
assert.strictEqual(a('1,234.56'), 123456);
assert.strictEqual(a('12.30'), 1230);
assert.strictEqual(a('1.234.567'), 123456700);
assert.strictEqual(a('1,234,567'), 123456700);
assert.strictEqual(a('1.234'), null, 'ambiguous');
assert.strictEqual(a('12,345'), null, 'ambiguous');
assert.strictEqual(a('5'), 500);
assert.strictEqual(a('0,5'), 50);
assert.strictEqual(a('42,18 €'), 4218);
assert.strictEqual(a('EUR -42,18'), -4218);
assert.strictEqual(a('−42,18'), -4218);
assert.strictEqual(a('(12,00)'), -1200);
assert.strictEqual(a('12,00 S'), -1200);
assert.strictEqual(a('12,00 H'), 1200);
assert.strictEqual(a('1 234,56'), 123456);
assert.strictEqual(a('0,00'), 0);
for (const bad of ['', 'abc', '1,2,3', '--5', null, '12a']) assert.strictEqual(a(bad), null, 'bad: ' + bad);

// Datum
const d = I.parseDate;
assert.strictEqual(d('05.10.2026'), '2026-10-05');
assert.strictEqual(d('5.1.26'), '2026-01-05');
assert.strictEqual(d('31.12.99'), '1999-12-31');
assert.strictEqual(d('2026-10-05'), '2026-10-05');
assert.strictEqual(d('2026-10-05T10:00:00'), '2026-10-05');
assert.strictEqual(d('05.10.2026 14:33'), '2026-10-05');
assert.strictEqual(d('05/10/2026'), '2026-10-05');
assert.strictEqual(d('31.02.2026'), null);
assert.strictEqual(d('Buchungstag'), null);
assert.strictEqual(d(''), null);

// Text/Zeichensatz
assert.strictEqual(I.decodeBuffer(Buffer.from('﻿Ärger;Straße', 'utf8')), 'Ärger;Straße');
assert.strictEqual(I.decodeBuffer(Buffer.from([0x42, 0xfc, 0x72, 0x6f])), 'Büro');           // Windows-1252
assert.strictEqual(I.decodeBuffer(Buffer.from('﻿Äb', 'utf16le')), 'Äb');

// CSV-Parser
assert.deepStrictEqual(I.parseCsv('a;b;c\n"x;1";"he said ""hi""";z\r\n\r\n1;2;3', ';'),
  [['a', 'b', 'c'], ['x;1', 'he said "hi"', 'z'], ['1', '2', '3']]);
assert.deepStrictEqual(I.parseCsv('a;"zwei\nZeilen";c', ';'), [['a', 'zwei\nZeilen', 'c']]);
assert.strictEqual(I.detectDelimiter('Datum;Betrag;Text\n01.10.2026;-12,30;Rewe\n02.10.2026;1.200,00;Gehalt\n'), ';');
assert.strictEqual(I.detectDelimiter('Date,Amount,Memo\n2026-10-01,-12.30,Rewe\n2026-10-02,1200.00,Salary\n'), ',');
assert.strictEqual(I.detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');

function run(text, opts) {
  const delim = I.detectDelimiter(text);
  const table = I.parseCsv(text, delim);
  const hi = I.findHeader(table);
  const m = I.guessMapping(table[hi]);
  return { delim, table, hi, m, ...I.buildItems(table, hi, m, opts) };
}

// 1) Sparkasse CSV-CAMT (Windows-1252 -> hier als Text), Datum zweistellig
const sparkasse = [
  'Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Glaeubiger ID;Mandatsreferenz;Kundenreferenz (End-to-End);Sammlerreferenz;Lastschrift Ursprungsbetrag;Auslagenersatz Ruecklastschrift;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Info',
  'DE12;01.10.26;01.10.26;MIETE;Miete Oktober;;;;;;;Vermieter GmbH;DE99;BIC;-720,00;EUR;Umsatz gebucht',
  'DE12;05.10.26;05.10.26;GEHALT/RENTE;Lohn 10/2026;;;;;;;Arbeitgeber AG;DE98;BIC;2.450,00;EUR;Umsatz gebucht',
  'DE12;07.10.26;07.10.26;KARTENZAHLUNG;REWE Markt;;;;;;;REWE Markt GmbH;DE97;BIC;-42,18;EUR;Umsatz gebucht'
].join('\r\n');
let r = run(sparkasse);
assert.strictEqual(r.delim, ';');
assert.strictEqual(r.hi, 0);
assert.strictEqual(r.items.length, 3);
assert.deepStrictEqual(r.items[0], { line: 2, date: '2026-10-01', type: 'expense', amount: 72000, note: 'Vermieter GmbH – Miete Oktober' });
assert.strictEqual(r.items[1].type, 'income');
assert.strictEqual(r.items[1].amount, 245000);
assert.strictEqual(r.items[2].note, 'REWE Markt GmbH – REWE Markt');
assert.strictEqual(r.skipped, 0);

// 2) ING: Kontoinformationen vor der Kopfzeile, "Buchung" statt Datum, Saldo-Spalte, Fußzeile
const ing = [
  'Umsatzanzeige;Datei erstellt am: 11.10.2026 10:00',
  '',
  'IBAN;DE12 3456',
  'Kontoname;Girokonto',
  'Bank;ING',
  'Kunde;Max Mustermann',
  'Zeitraum;01.10.2026 - 11.10.2026',
  'Saldo;1.234,56;EUR',
  '',
  'Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung',
  '07.10.2026;07.10.2026;Stadtwerke;Lastschrift;Strom Abschlag;1.000,00;EUR;-58,00;EUR',
  '05.10.2026;05.10.2026;Arbeitgeber AG;Gehalt/Rente;Oktober;1.058,00;EUR;2.450,00;EUR'
].join('\n');
r = run(ing);
assert.strictEqual(r.hi, 7, 'header row ' + r.hi);  // Leerzeilen sind schon entfernt
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[0].amount, 5800);
assert.strictEqual(r.items[0].type, 'expense');
assert.strictEqual(r.items[0].note, 'Stadtwerke – Strom Abschlag');
assert.strictEqual(r.items[1].type, 'income');

// 3) DKB: getrennte Spalten für Zahlungspflichtige/Empfänger, Einnahmen nutzen den Auftraggeber
const dkb = [
  '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
  '"07.10.26";"07.10.26";"Gebucht";"Max Mustermann";"EDEKA";"Einkauf";"Ausgang";"DE11";"-23,45";"";"";""',
  '"05.10.26";"05.10.26";"Gebucht";"Arbeitgeber AG";"Max Mustermann";"Gehalt";"Eingang";"DE22";"2.450,00";"";"";""'
].join('\n');
r = run(dkb);
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[0].note, 'EDEKA – Einkauf');
assert.strictEqual(r.items[1].note, 'Arbeitgeber AG – Gehalt');

// 4) Soll/Haben in getrennten Spalten
const sh = 'Datum;Text;Soll;Haben\n01.10.2026;Miete;720,00;\n05.10.2026;Gehalt;;2.450,00\n06.10.2026;Nichts;;\n';
r = run(sh);
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[0].type, 'expense');
assert.strictEqual(r.items[0].amount, 72000);
assert.strictEqual(r.items[1].type, 'income');
assert.strictEqual(r.skipped, 1, 'row without amount counted as skipped');

// 5) Englisch, Komma-getrennt, Punkt als Dezimalzeichen, ISO-Datum
const en = 'Date,Description,Amount\n2026-10-01,Rent,-720.00\n2026-10-05,Salary,"2,450.00"\n';
r = run(en);
assert.strictEqual(r.delim, ',');
assert.deepStrictEqual(r.items.map((i) => [i.type, i.amount]), [['expense', 72000], ['income', 245000]]);

// 6) Vorzeichen umkehren (Ausgaben positiv, z. B. Kreditkarte)
r = run('Datum;Beschreibung;Betrag\n01.10.2026;Hotel;120,00\n02.10.2026;Erstattung;-20,00\n', { invert: true });
assert.deepStrictEqual(r.items.map((i) => [i.type, i.amount]), [['expense', 12000], ['income', 2000]]);

// 7) Unlesbare Zeilen werden gezählt, Fußzeile ignoriert
r = run('Datum;Text;Betrag\n01.10.2026;A;-1,00\nkaputt;B;-2,00\n03.10.2026;C;abc\nEnde der Liste\n');
assert.strictEqual(r.items.length, 1);
assert.strictEqual(r.skipped, 2);

// 8) lange Texte werden gekürzt, Zeilenumbrüche im Feld bereinigt
r = run('Datum;Text;Betrag\n01.10.2026;"' + 'x'.repeat(200) + '\nzweite Zeile";-1,00\n');
assert(r.items[0].note.length <= 120);
assert(!r.items[0].note.includes('\n'));

console.log('IMPORTER_OK');
