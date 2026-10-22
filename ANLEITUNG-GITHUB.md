# Haushaltsbuch auf GitHub bringen

Stand 22.10.2026 · Version 1.4.2 · Repository: `MartinRie/Haushaltsbuch` (öffentlich)

Wie bei WarmSix: Du veröffentlichst das Repo mit GitHub Desktop, danach baut GitHub bei jedem Release
selbst die Windows-, Mac- und Linux-Version und hängt sie an das Release. Bei öffentlichen Repositories
kostet GitHub Actions nichts.

---

## Einmalig: Dateien hochladen

Dein Ordner `Downloads/Haushaltsbuch` ist schon das Repo `MartinRie/Haushaltsbuch` und mit GitHub verbunden.
Ich habe alle Projektdateien direkt hineingelegt.

0. **Bauanleitung an ihren Platz schieben.** Den versteckten Ordner `.github` durfte ich nicht anlegen,
   die Datei liegt deshalb als `release.yml` direkt im Ordner. Im Terminal:
   ```
   cd ~/Downloads/Haushaltsbuch
   mkdir -p .github/workflows && mv release.yml .github/workflows/release.yml
   ```
1. **Alte Lieferdateien löschen.** Sie sind mit deinem ersten Upload ins Repo gerutscht und gehören
   nicht hinein. Im Finder in `Downloads/Haushaltsbuch` diese fünf Dateien in den Papierkorb legen:
   `Haushaltsbuch-Quellcode.zip`, `Haushaltsbuch-Repo.zip`, `Haushaltsbuch-Update-1.4.1-Mac.sh`,
   `LIESMICH-Update-1.4.1.txt`, `SHA256SUMS-Update-1.4.1.txt`.
   Oder im Terminal (im selben Ordner):
   ```
   rm Haushaltsbuch-Quellcode.zip Haushaltsbuch-Repo.zip Haushaltsbuch-Update-1.4.1-Mac.sh LIESMICH-Update-1.4.1.txt SHA256SUMS-Update-1.4.1.txt
   ```
   Die neue `.gitignore` sorgt dafür, dass solche Dateien künftig nicht mehr hineinrutschen.
2. **GitHub Desktop** öffnen, Repository **Haushaltsbuch** wählen. Links stehen jetzt rund 40 Änderungen:
   die neuen Projektdateien (darunter `.github/workflows/release.yml`, `main.js`, `updater.js`, `package.json`,
   die Ordner `tests`, `tools`, `installer`, `build`, `assets`), geänderte `README.md` und
   `UEBERGABEPROTOKOLL.md` und die fünf gelöschten alten Dateien. Alle Haken gesetzt lassen.
3. Unten links eine Beschreibung eintippen, z. B. `Haushaltsbuch 1.4.2`, dann **Commit to main**.
4. Oben **Push origin**.
5. Im Browser `https://github.com/MartinRie/Haushaltsbuch` öffnen. Unter **Actions** sollte
   „Release bauen“ stehen. Ein Push allein startet noch keinen Bau.
   Falls das Repo noch privat ist: *Settings* › ganz unten *Change visibility* › *Make public*.

## Erstes Release: 1.4.2

5. Im Repository rechts **Releases** › **Draft a new release** (bzw. *Create a new release*).
6. **Choose a tag** › `v1.4.2` eintippen › *Create new tag: v1.4.2 on publish*.
7. Titel `Haushaltsbuch 1.4.2`, Text zum Beispiel:
   ```
   - Update-Funktion: Einstellungen › Updates (sucht auf Wunsch beim Start nach neuen Versionen)
   - Jetzt auch für Linux (AppImage)
   ```
   Dieser Text erscheint später in der App unter „Neu in …“.
8. **Publish release**.
9. Unter **Actions** läuft jetzt „Release bauen“: erst Tests, Windows und Linux, dann Mac, dann das
   Hochladen. Nach etwa 10–15 Minuten hängen am Release:

   | Datei | Wofür |
   |---|---|
   | `Haushaltsbuch-Setup-1.4.2.exe` | Windows, vollständige Installation |
   | `Haushaltsbuch-Update-1.4.2.exe` | Windows, kleines Update für 1.4.x |
   | `Haushaltsbuch-Mac-1.4.2.zip` | Mac, vollständige App |
   | `Haushaltsbuch-Update-1.4.2-Mac.sh` | Mac, kleines Update für 1.4.x (Terminal) |
   | `Haushaltsbuch-1.4.2-x86_64.AppImage` | Linux |
   | `Haushaltsbuch-1.4.2.asar` | Programmcode, holt sich die Mac-App beim Update selbst |
   | `SHA256SUMS.txt` | Prüfsummen, die App prüft jeden Download damit |

## Deine installierten Versionen auf 1.4.2 bringen

1.4.0 und 1.4.1 haben die Update-Funktion noch nicht, daher einmal von Hand:
- **Windows:** `Haushaltsbuch-Update-1.4.2.exe` vom Release laden und starten (oder das volle Setup).
- **Mac:** `Haushaltsbuch-Update-1.4.2-Mac.sh` laden, dann im Terminal
  `bash ~/Downloads/Haushaltsbuch-Update-1.4.2-Mac.sh`

Ab 1.4.2 kommen Updates über die App: *Einstellungen › Updates* bzw. der Hinweis „Update x.y.z“
links unten in der Seitenleiste.

**Weitergeben:** Einfach den Link schicken: `https://github.com/MartinRie/Haushaltsbuch/releases/latest`

---

## Später: der normale Ablauf

1. Ich lege die geänderten Dateien direkt in `Downloads/Haushaltsbuch` (solange der Ordner verbunden ist).
2. GitHub Desktop: kurze Beschreibung › **Commit to main** › **Push origin**.
3. Release mit dem neuen Tag anlegen, z. B. `v1.4.3` (muss zur Version in `package.json` passen).
4. Nach 10–15 Minuten sind die Dateien da, und alle Haushaltsbücher mit eingeschalteter
   automatischer Suche zeigen beim nächsten Start den Hinweis.

Nur ein Probebau ohne Release: *Actions* › *Release bauen* › **Run workflow**. Die Dateien liegen dann
unten auf der Lauf-Seite unter *Artifacts*, ans Release wird nichts gehängt.

---

## Wenn etwas schiefgeht

| Was du siehst | Was tun |
|---|---|
| Unter *Actions* steht kein „Release bauen“ | Der Ordner `.github` fehlt im Repo (versteckt). Prüfen, ob er im Ordner liegt, dann *Commit*, *Push*. |
| Roter Kreis beim Lauf | Lauf anklicken › den roten Schritt aufklappen › den Text am Ende in den Chat kopieren. |
| „Der Release-Tag ist … in package.json steht aber …“ | Tag und Version passen nicht. Release löschen und mit dem richtigen Tag neu anlegen. |
| „Resource not accessible by integration“ beim Hochladen | *Settings* › *Actions* › *General* › *Workflow permissions* › **Read and write permissions** › *Save*, dann **Re-run all jobs**. |
| Die App meldet „Auf GitHub ist noch keine Version veröffentlicht“ | Es gibt noch kein Release, oder das Repo heißt anders als `MartinRie/Haushaltsbuch`. |

**Hinweis:** Die Dateien sind nicht signiert. Windows SmartScreen und der Mac (`xattr -cr …`) melden sich
beim ersten Mal wie bisher. Bei Updates aus der App heraus entfällt das in der Regel, nur Windows fragt beim Update nach der Erlaubnis (Benutzerkontensteuerung).
