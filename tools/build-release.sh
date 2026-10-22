#!/usr/bin/env bash
# Baut die Release-Dateien nach out/. Wird vom GitHub-Workflow aufgerufen, läuft aber auch lokal.
#   bash tools/build-release.sh win     (Linux mit makensis)  -> Setup, kleines Update (Windows + Mac-Skript), app.asar
#   bash tools/build-release.sh linux   (Linux)               -> AppImage
#   bash tools/build-release.sh mac     (macOS, nach "win")   -> Mac-App als Zip, mit derselben app.asar
set -euo pipefail
cd "$(dirname "$0")/.."

V=$(node -p "require('./package.json').version")
OUT=out
mkdir -p "$OUT"
IGNORE=(--ignore='^/node_modules' --ignore='^/release' --ignore='^/out' --ignore='^/installer' --ignore='^/build' --ignore='^/tests' --ignore='^/tools' --ignore='^/\.github' --ignore='^/dist')

case "${1:-}" in
  win)
    rm -rf release/win-unpacked
    npx electron-builder --win dir --x64 --publish never
    U=release/win-unpacked
    node tools/patch-exe.js "$U/Haushaltsbuch.exe" build/icon.ico
    find "$U/locales" -type f ! -name 'de.pak' ! -name 'en-US.pak' -delete
    MAKENSIS=${MAKENSIS:-makensis}
    "$MAKENSIS" -V2 -DVERSION="$V" -DSRCDIR="$PWD/$U" -DOUTDIR="$PWD/$OUT" -DICON="$PWD/build/icon.ico" installer/haushaltsbuch.nsi
    MAKENSIS="$MAKENSIS" node tools/make-update.js "$U/resources/app.asar" "$OUT"
    cp "$U/resources/app.asar" "$OUT/Haushaltsbuch-$V.asar"
    ;;
  linux)
    npx electron-builder --linux AppImage --x64 --publish never
    cp "release/Haushaltsbuch-$V-x86_64.AppImage" "$OUT/"
    ;;
  mac)
    ASAR="$OUT/Haushaltsbuch-$V.asar"
    [ -f "$ASAR" ] || { echo "Erst 'win' bauen (liefert $ASAR)"; exit 1; }
    rm -rf dist
    npx @electron/packager . Haushaltsbuch --platform=darwin --arch=arm64 --out=dist --overwrite \
      --app-bundle-id=de.haushaltsbuch.app --app-version="$V" --build-version="$V" --icon=build/icon.icns \
      --prebuilt-asar="$ASAR" "${IGNORE[@]}"
    APP=dist/Haushaltsbuch-darwin-arm64/Haushaltsbuch.app
    if command -v codesign >/dev/null; then
      codesign --force --deep --sign - "$APP"
      codesign --verify --deep --strict "$APP"
    fi
    if command -v ditto >/dev/null; then
      ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/Haushaltsbuch-Mac-$V.zip"
    else
      (cd "$(dirname "$APP")" && zip -qry "$OLDPWD/$OUT/Haushaltsbuch-Mac-$V.zip" Haushaltsbuch.app)
    fi
    ;;
  *)
    echo "Aufruf: bash tools/build-release.sh win|linux|mac"; exit 2 ;;
esac
ls -l "$OUT"
