# Haushaltsbuch

Ein schlichtes Haushaltsbuch für Windows, Mac und Linux. Alle Daten bleiben auf deinem Rechner.

- Monats- und Jahresübersicht mit Übertrag in den nächsten Monat, optionaler Anfangsbestand
- Buchungen, Kategorien mit Monatsbudget, Daueraufträge
- Kontoauszug-Import (CSV) mit Vorschau und Duplikaterkennung
- Sicherung/Wiederherstellung, CSV-Export für Excel
- Update-Funktion: sucht auf Wunsch beim Start nach einer neuen Version auf GitHub

## Herunterladen

Unter **[Releases](https://github.com/MartinRie/Haushaltsbuch/releases/latest)**:

| System | Datei |
|---|---|
| Windows 10/11 (64 Bit) | `Haushaltsbuch-Setup-<Version>.exe` |
| Mac (Apple Silicon) | `Haushaltsbuch-Mac-<Version>.zip` |
| Linux (x86_64) | `Haushaltsbuch-<Version>-x86_64.AppImage` |

Die Programme sind nicht signiert:
- **Windows:** Bei „Der Computer wurde durch Windows geschützt“ auf *Weitere Informationen* › *Trotzdem ausführen*.
- **Mac:** Zip entpacken, `Haushaltsbuch.app` nach *Programme* ziehen, dann einmalig im Terminal:
  `xattr -cr /Applications/Haushaltsbuch.app`
- **Linux:** Datei ausführbar machen (`chmod +x Haushaltsbuch-*.AppImage`) und starten.

Die Daten liegen unter Windows in `%APPDATA%\Haushaltsbuch`, auf dem Mac in `~/Library/Application Support/Haushaltsbuch`,
unter Linux in `~/.config/Haushaltsbuch`.

## Updates

Unter *Einstellungen › Updates* sucht das Haushaltsbuch nach der neuesten Version (automatisch höchstens einmal am Tag,
abschaltbar). Gefragt wird nur die GitHub-Seite dieses Projekts.

- Gleiche Hauptversion (z. B. 1.4.x → 1.4.y): Es wird nur der Programmcode ausgetauscht (ca. 100–200 KB).
  Windows startet dafür ein kleines Update-Programm (mit Windows-Rückfrage), der Mac tauscht die Datei selbst und startet neu.
- Neue Hauptversion (z. B. 1.5.0, neue Electron-Laufzeit): Windows lädt das vollständige Setup, auf dem Mac öffnet sich die Download-Seite.
- Linux (AppImage): Die AppImage-Datei wird ersetzt.

Jede Datei wird vor dem Einspielen mit der `SHA256SUMS.txt` desselben Releases verglichen.
Ohne App gibt es die kleinen Updates auch als Datei: `Haushaltsbuch-Update-<Version>.exe` und `Haushaltsbuch-Update-<Version>-Mac.sh`.

## Neue Version veröffentlichen

1. Version in `package.json` hochzählen. Die letzte Stelle für kleine Änderungen (1.4.2 → 1.4.3), die mittlere nur,
   wenn sich die Electron-Version ändert (dann gibt es kein kleines Update).
2. Committen und pushen.
3. Auf GitHub ein Release mit dem Tag `v<Version>` veröffentlichen (z. B. `v1.4.3`).
4. Der Workflow *Release bauen* testet, baut alle Systeme und hängt die Dateien samt `SHA256SUMS.txt` an das Release (ca. 10–15 Minuten).

## Entwickeln

    npm install
    npm start          # App starten
    npm test           # Tests (jsdom, ohne Electron)

Lokal bauen: `bash tools/build-release.sh win|linux|mac` (Windows und Linux auf Linux mit `makensis`, Mac auf macOS; „mac“ braucht zuerst „win“).

## Lizenz

MIT, siehe `LICENSE`.
