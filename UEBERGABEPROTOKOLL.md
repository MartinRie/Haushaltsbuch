# Übergabeprotokoll Haushaltsbuch

Stand: 22.10.2026 · Version 1.4.2 · Auftraggeber: Martin Riedel
Repository (geplant, öffentlich): `https://github.com/MartinRie/Haushaltsbuch`

## 1. Was ist das?
Schlichtes Haushaltsbuch für Windows 10/11 (64 Bit), Mac (Apple Silicon) und Linux (x86_64, AppImage).
Electron-App mit reinem HTML/CSS/JavaScript, ohne Framework. Alle Daten bleiben lokal auf dem Rechner.

## 2. Lieferumfang (Ordner Downloads/Haushaltsbuch = Git-Repo MartinRie/Haushaltsbuch)
Alle Projektdateien liegen direkt im Repo-Ordner: Quellcode, Tests (`tests/`), Bauskripte (`tools/`),
Installer-Skripte (`installer/`), Icons (`build/`, `assets/`), GitHub-Workflow (`.github/workflows/release.yml`),
dazu `README.md`, `LICENSE` (MIT), `ANLEITUNG-GITHUB.md` (Hochladen, Release, Fehlerhilfe) und dieses Protokoll.

Ältere Lieferdateien im Ordner (`Haushaltsbuch-Repo.zip`, `Haushaltsbuch-Quellcode.zip`, Update 1.4.1) sind
überholt und per `.gitignore` vom Repo ausgeschlossen; sie können gelöscht werden. Die großen 1.4.0-Installer
liegen weiter in `Desktop/Haushaltsbuch`; künftig kommen alle Installer vom GitHub-Release.

## 3. Funktionen (Stand 1.4.2)
- Übersicht pro Monat und Jahr: Übertrag, Einnahmen, Ausgaben, Saldo; Ausgaben nach Kategorie; Jahresdiagramm.
- Buchungen anlegen, ändern, löschen, filtern; Übertrag in den Folgemonat, optionaler Anfangsbestand.
- Daueraufträge (monatlich, vierteljährlich, jährlich).
- Monatsbudget pro Ausgaben-Kategorie (Jahresansicht: Zwölffaches).
- Kontoauszug-Import (CSV) mit Spaltenerkennung, Vorschau, Duplikaterkennung, Kategorie-Lernen.
- Sicherung/Wiederherstellung mit Prüfung und Sicherheitskopie; CSV-Export.
- **Neu: Update-Funktion** (Einstellungen › Updates, Hinweis in der Seitenleiste), siehe Abschnitt 6.
- **Neu: Linux-Version** als AppImage.

## 4. Daten
- Windows `%APPDATA%\Haushaltsbuch`, Mac `~/Library/Application Support/Haushaltsbuch`, Linux `~/.config/Haushaltsbuch`.
- `haushaltsbuch.json` (Beträge in Cent, Datum `YYYY-MM-DD`), dazu `.bak.json` vom letzten Speichern.
- `update.json`: Einstellung „automatisch suchen“, Zeitpunkt und Ergebnis der letzten Prüfung.
- Updates verändern die Daten nie.

## 5. Bauen (GitHub Actions)
Workflow `.github/workflows/release.yml`, startet beim Veröffentlichen eines Releases (Tag `v<Version>`)
oder von Hand. Ablauf:
1. **Ubuntu:** Version prüfen (Tag = `package.json`), `npm ci`, alle Tests, dann
   `tools/build-release.sh win` (electron-builder `--win dir`, Exe-Icon/Version per `resedit`, eigenes
   NSIS-Setup, kleines Update für Windows und Mac, `app.asar`) und `tools/build-release.sh linux` (AppImage).
2. **macOS:** `tools/build-release.sh mac`: `@electron/packager` mit genau derselben `app.asar`,
   ad-hoc-Signatur (`codesign --sign -`) und Prüfung, Zip per `ditto`.
3. **Veröffentlichen:** `SHA256SUMS.txt` erzeugen, alle Dateien per `gh release upload` ans Release.

Versionsregel: letzte Stelle für normale Änderungen (kleines Update möglich), mittlere Stelle nur bei
neuer Electron-Version (dann vollständiges Setup nötig). Electron ist 33.2.0.

## 6. Updates
- **Prüfung:** `https://api.github.com/repos/MartinRie/Haushaltsbuch/releases/latest`, automatisch höchstens
  einmal am Tag (abschaltbar) oder per Knopf. Ohne Internet passiert nichts.
- **Sicherheit:** Es werden nur Dateien von `github.com/MartinRie/Haushaltsbuch/releases/download/` geladen, jede
  wird gegen `SHA256SUMS.txt` desselben Releases geprüft. Die Daten aus der Oberfläche bestimmen nie die
  Download-Adresse. Grenze: Wer das GitHub-Konto übernimmt, könnte auch Prüfsummen fälschen; eine echte
  Signatur gibt es (wie beim ganzen Programm) nicht.
- **Windows:** gleiche Serie lädt `Haushaltsbuch-Update-<v>.exe` (ca. 180 KB), neue Serie das Setup.
  Start mit Windows-Rückfrage, die App beendet sich. Das Update-Programm prüft Installation und Version,
  wartet bei laufender App und rollt bei Fehlern zurück.
- **Mac:** gleiche Serie lädt `Haushaltsbuch-<v>.asar` und tauscht sie in der App aus (Info.plist,
  ad-hoc-Signatur, Neustart; bei Fehler Rückkehr zur alten Datei). Neue Serie oder schreibgeschützte App:
  Download-Seite öffnet sich.
- **Linux:** lädt die neue AppImage-Datei, ersetzt die laufende und startet neu.
- Manuelle kleine Updates: `Haushaltsbuch-Update-<v>.exe` und `Haushaltsbuch-Update-<v>-Mac.sh`
  (Terminal) am Release.

## 7. Tests (Stand 22.10.2026)
- `npm test`: Bedienabläufe (jsdom) für Übersicht, Übertrag, Daueraufträge, Sicherung, Budget, Import,
  Update-Feld; CSV-Importer; `updater.js` (Versionen, Dateiauswahl je System, fremde Adressen,
  Prüfsummen, Asar-Header-Hash gegen `@electron/asar`, Mac-Austausch mit Rückfall, AppImage-Austausch).
- Gesamtablauf in echtem Electron 33.2.0 (Linux): Start, Hinweis „Update 1.4.3“, Download, Prüfung,
  Austausch der AppImage-Datei, Neustart der neuen Datei. GitHub dabei nachgestellt.
- GitHub-Lauf in frischer Kopie nachgestellt (`npm ci`, Tests, alle drei Builds): grün.
- Unter Wine: Setup 1.4.0 installiert, Update 1.4.2 darüber, Setup 1.4.2 darüber, Deinstallation; alle
  Abbruchfälle des Update-Programms.
- AppImage 1.4.2 gestartet, Oberfläche lädt. Mac-Update-Skript in nachgebauter App-Struktur.

## 8. Bekannte Einschränkungen und offene Punkte
1. **Nicht auf deinen echten Rechnern getestet.** Windows nur unter Wine, Mac nur nachgebildet (der Mac-Teil
   des Workflows läuft zum ersten Mal auf GitHub), Linux in einer Cloud-Umgebung.
2. **Der echte GitHub-Lauf** ist noch nicht gelaufen. Erfahrungsgemäß braucht der erste Lauf ein, zwei
   Nachbesserungen.
3. **Nicht signiert** (SmartScreen, Mac-Quarantäne beim ersten Herunterladen).
4. **Electron 33** wird nicht mehr mit Sicherheitsupdates versorgt. Sinnvoll wäre irgendwann 1.5.0 mit
   aktueller Electron-Version (einmal vollständiges Setup bzw. neue Mac-App).
5. Mac nur Apple Silicon, Linux nur x86_64.
6. Kontoauszug-Import ohne echte Bankdatei entwickelt; Doppelbuchung möglich, wenn ein Posten als
   Dauerauftrag und im Import steht.
7. Idee für später: dunkles Design.
