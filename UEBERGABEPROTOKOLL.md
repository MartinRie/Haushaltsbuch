# Übergabeprotokoll Haushaltsbuch

Stand: 21.10.2026 · Version 1.4.1 (Grundinstallation 1.4.0 + kleines Update) · Auftraggeber: Martin Riedel

## 1. Was ist das?
Schlichtes Haushaltsbuch für Windows 10/11 (64 Bit) und Mac (Apple Silicon). Electron-App mit reinem HTML/CSS/JavaScript, ohne Framework. Alle Daten bleiben lokal auf dem Rechner.

## 2. Lieferumfang (Ordner Desktop/Haushaltsbuch)
| Datei | Zweck |
|---|---|
| Haushaltsbuch-Setup-1.4.0.exe.part0–2 | Windows-Installer, in Teilen (Upload-Limit 30 MB) |
| Haushaltsbuch-Mac-1.4.0.zip.part0–3 | Mac-App, in Teilen |
| SHA256SUMS-1.4.0.txt | Prüfsummen der zusammengesetzten Dateien |
| LIESMICH.txt | Installationsanleitung, Neuerungen |
| Haushaltsbuch-Quellcode.zip | App-Quellcode mit Installer-Skript |
| Haushaltsbuch-Update-1.4.1.exe | Kleines Windows-Update (100 KB) für eine installierte 1.4.x |
| Haushaltsbuch-Update-1.4.1-Mac.sh | Kleines Mac-Update (127 KB) als Terminal-Skript |
| SHA256SUMS-Update-1.4.1.txt, LIESMICH-Update-1.4.1.txt | Prüfsummen und Anleitung zum Update |
| Haushaltsbuch-Repo.zip | Fertiges Git-Repo (Quellcode, Tests, README), bereit für GitHub |
| UEBERGABEPROTOKOLL.md | Dieses Dokument |

Teile zusammensetzen und prüfen (Terminal auf dem Mac):

    cd ~/Desktop/Haushaltsbuch
    cat Haushaltsbuch-Setup-1.4.0.exe.part* > Haushaltsbuch-Setup-1.4.0.exe
    cat Haushaltsbuch-Mac-1.4.0.zip.part*   > Haushaltsbuch-Mac-1.4.0.zip
    shasum -a 256 -c SHA256SUMS-1.4.0.txt

Dateien der Versionen 1.0.0 bis 1.3.0 im Ordner können gelöscht werden.

## 3. Installation
- **Windows:** Setup.exe doppelklicken, UAC bestätigen. Bei SmartScreen „Weitere Informationen“, „Trotzdem ausführen“ (App ist nicht signiert). Installiert nach `C:\Programme\Haushaltsbuch`, mit Desktop-Symbol und Startmenü-Eintrag. Update installiert sich über die vorhandene Version, Deinstallation über Einstellungen, Apps.
- **Mac:** zip entpacken, `Haushaltsbuch.app` nach Programme, einmalig im Terminal:

      codesign --force --deep --sign - /Applications/Haushaltsbuch.app
      xattr -cr /Applications/Haushaltsbuch.app

## 4. Funktionen (Stand 1.4.1)
- Übersicht pro Monat und Jahr: Übertrag, Einnahmen, Ausgaben, Saldo; Ausgaben nach Kategorie; Jahresdiagramm.
- Buchungen anlegen, ändern, löschen, filtern.
- Übertrag des Saldos in den Folgemonat und das Folgejahr, optionaler Anfangsbestand (Einstellungen).
- Daueraufträge (monatlich, vierteljährlich, jährlich); fällige Buchungen werden beim Start und beim Zurückkehren in die App als normale Buchungen angelegt.
- Monatsbudget pro Ausgaben-Kategorie (Kategorien). In der Jahresansicht gilt das Zwölffache.
- Kontoauszug-Import aus CSV (Buchungen, „Kontoauszug importieren …“) mit Spaltenerkennung, Vorschau, Duplikaterkennung, Kategorie-Lernen aus früheren Buchungen.
- Sicherung und Wiederherstellung als Datei (Einstellungen), mit Prüfung und automatischer Sicherheitskopie vor dem Wiederherstellen.
- CSV-Export für Excel.
- Versionsanzeige unter Einstellungen (ab 1.4.1).

## 5. Daten
- Windows: `%APPDATA%\Haushaltsbuch\haushaltsbuch.json`
- Mac: `~/Library/Application Support/Haushaltsbuch/haushaltsbuch.json`
- Bei jedem Speichern wird die vorherige Datei als `haushaltsbuch.bak.json` behalten; geschrieben wird atomar (temporäre Datei, dann Umbenennen).
- Format: Beträge in ganzen Cent, Datum als `YYYY-MM-DD`. Felder: `categories` (name, type, optional `budget`), `transactions`, `recurring`, `opening`.
- Beim Update bleiben die Daten erhalten.

## 6. Technik und Build (für Weiterentwicklung)
- Electron 33.2.0, `contextIsolation`, `sandbox`, strikte CSP (`default-src 'self'`). Dateien: `main.js`, `preload.js`, `index.html`, `app.css`, `app.js`, `validate.js`, `importer.js`.
- Entwickelt in einer Linux-Cloud-Umgebung. Dort stehen weder Wine noch .NET zur Verfügung, daher:
  - Mac-App: `@electron/packager` (darwin, arm64), Icon als `icon.icns` (aus dem 512-px-PNG).
  - Windows: `electron-builder --win dir --x64` (nur entpackte App), Exe per `resedit` mit Icon und Versionsinfo versehen, Installer mit eigenem NSIS-Skript `installer/haushaltsbuch.nsi` (makensis, Deutsch, Installation für alle Benutzer).
  - Versionsnummer muss an drei Stellen angehoben werden: `package.json`, `installer/haushaltsbuch.nsi` (zweimal), `patch-exe.js`.
- Auf einem Windows-PC mit Node genügt zum Testen `npm install` und `npm start`; ein Installer lässt sich dort auch mit `electron-builder --win nsis` bauen.

## 7. Updates ohne neues Setup (ab 1.4.1)
Die große Setup-Datei (77 MB) besteht fast nur aus der Electron-Laufzeit. Der eigene Programmcode steckt in einer einzigen Datei, `resources/app.asar` (ca. 100 KB). Ein Update tauscht nur diese Datei aus.
- **Voraussetzung:** Die Prüfsummen-Sperre von Electron (Fuse `EnableEmbeddedAsarIntegrityValidation`) ist in der Windows-Exe und der Mac-App aus; geprüft am 21.10.2026.
- **Windows:** `Haushaltsbuch-Update-<v>.exe` (NSIS, `installer/update.nsi`). Findet die Installation über den Registry-Eintrag (`InstallLocation`), passt nur auf dieselbe Serie (z. B. 1.4.x), verweigert ältere Versionen, wartet, solange das Programm läuft, tauscht `app.asar` über Umbenennen aus (bei Fehler wird die alte Datei zurückgeholt) und setzt die Versionsnummer unter „Apps“. Ohne Fenster: Schalter `/S`.
- **Mac:** `Haushaltsbuch-Update-<v>-Mac.sh` (Vorlage `installer/update-mac.sh.in`) mit eingebetteter, per SHA-256 geprüfter `app.asar`. Gleiche Prüfungen, aktualisiert `Info.plist` (Version und Asar-Hash), signiert ad hoc neu, entfernt Quarantäne; bei Fehler Rückkehr zur alten Version.
- **Nächstes Update bauen:** Version in `package.json` anheben (Major.Minor gleich lassen, z. B. 1.4.2), `npx electron-builder --win dir --x64`, dann `MAKENSIS=<makensis> node tools/make-update.js release/win-unpacked/resources/app.asar <ausgabe>`. Ein Update enthält immer den kompletten Programmcode, d. h. 1.4.3 lässt sich auch direkt auf 1.4.0 einspielen.
- **Grenze:** Ändert sich die Electron-Version (Sicherheitsupdates, neue Funktionen der Laufzeit), braucht es wieder ein vollständiges Setup mit neuer Minor-Version (z. B. 1.5.0). Kleine Updates passen dann auf 1.5.x.

## 8. Tests
Automatische jsdom-Tests (Bedienabläufe mit nachgebildeter Electron-Schnittstelle): `smoke` (Grundablauf), `smoke2` (Übertrag), `smoke3` (Daueraufträge), `smoke4` (Sicherung), `smoke5` (Budget und Import), `imp1` (CSV-Importer: Beträge, Datumsformate, Kodierungen, Sparkasse/ING/DKB-ähnliche Layouts). Alle liefen zuletzt fehlerfrei.

Zusätzlich am 21.10.2026:
- Das echte Setup 1.4.0 unter Wine (Windows-Emulation auf Linux) installiert: Programmordner und Registry-Eintrag wie vorgesehen.
- Update 1.4.1 unter Wine darüber eingespielt; außerdem die Fälle gleiche Version, neuere Version, falsche Serie, keine Installation und „Programm läuft“ (Update bricht ab, alte Version bleibt).
- Mac-Update-Skript in einer nachgebauten App-Struktur getestet (mit Ersatz für PlistBuddy/codesign): normales Update, alle Abbruchfälle, beschädigte Datei, fehlende Schreibrechte, Zurückrollen bei Fehler.
- Programmcode 1.4.1 in echtem Electron 33.2.0 (Linux) gestartet: lädt Daten, zeigt „Haushaltsbuch 1.4.1“.

## 9. Bekannte Einschränkungen und offene Punkte
1. **Nicht auf echten Systemen getestet.** Windows nur unter Wine (Installation und Update, nicht die laufende App), Mac nur nachgebildet.
2. **CSV-Import ohne echte Bankdatei entwickelt.** Typische Formate werden erkannt, bei einer abweichenden Bank kann die Zuordnung von Hand nötig sein oder die Erkennung angepasst werden. Hilfreich: ein anonymisierter Auszug mit wenigen Zeilen.
3. **Doppelbuchung möglich**, wenn ein Posten sowohl als Dauerauftrag als auch im importierten Kontoauszug steht; im Import dann abwählen.
4. **Nicht signiert:** SmartScreen-Hinweis unter Windows, `codesign`/`xattr` auf dem Mac nötig. Signieren erfordert ein Entwicklerzertifikat.
5. **Mac nur Apple Silicon (arm64)**, keine Intel-Version. Keine automatische Update-Funktion; neue Versionen werden von Hand installiert.
6. **GitHub:** In der Arbeitsumgebung war kein GitHub-Zugang aktiv. Das Repo liegt als `Haushaltsbuch-Repo.zip` bereit und muss von dir hochgeladen werden (Befehle in der README bzw. unten).
7. **Kosmetisch, ungeklärt:** Unter Wine stand im Registry-Eintrag als Größe 0 („EstimatedSize“). Ob das auf echtem Windows auch so ist, ist ungeprüft; bei Bedarf beim nächsten vollständigen Setup ansehen.
8. **Update-Dateien sind ebenfalls nicht signiert** (gleiche SmartScreen-Meldung wie beim Setup).
9. **Idee für später:** dunkles Design.

## 10. Repo auf GitHub anlegen
Auf github.com ein leeres Repo `haushaltsbuch` anlegen (ohne README), dann:

    cd ~/Desktop/Haushaltsbuch
    unzip Haushaltsbuch-Repo.zip && cd repo
    git remote add origin https://github.com/<dein-name>/haushaltsbuch.git
    git branch -M main
    git push -u origin main

Die Installer gehören nicht ins Repo, sondern bei GitHub als „Release“ angehängt.
