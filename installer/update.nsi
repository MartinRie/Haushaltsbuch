; Kleines Update fuer eine vorhandene Haushaltsbuch-Installation.
; Tauscht nur resources\app.asar (der eigentliche Programmcode) aus.
; Aufruf: makensis -DASAR=<app.asar> -DVERSION=<x.y.z> -DSERIES=<x.y> -DOUTDIR=<Ausgabe> -DICON=<icon.ico> update.nsi
; SERIES = Grundversion (gleiche Electron-Laufzeit), auf die das Update passt, z. B. "1.4".

Unicode true
SetCompressor /SOLID lzma

!define APPNAME "Haushaltsbuch"
!define APPEXE "Haushaltsbuch.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}-Update ${VERSION}"
OutFile "${OUTDIR}\Haushaltsbuch-Update-${VERSION}.exe"
RequestExecutionLevel admin
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Update"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!define MUI_ICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Haushaltsbuch auf ${VERSION} aktualisieren"
!define MUI_WELCOMEPAGE_TEXT "Installiert ist Version $R1.$\r$\n$\r$\nDas Update ersetzt nur den Programmcode. Deine Buchungen bleiben unverändert.$\r$\n$\r$\nBitte schließe das Haushaltsbuch, bevor du fortfährst."
!define MUI_FINISHPAGE_TITLE "Update abgeschlossen"
!define MUI_FINISHPAGE_TEXT "Haushaltsbuch ist jetzt auf Version ${VERSION}."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Haushaltsbuch jetzt starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "German"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Haushaltsbuch benötigt ein 64-Bit-Windows." /SD IDOK
    Abort
  ${EndIf}
  SetRegView 64

  ; Vorhandene Installation suchen
  ReadRegStr $INSTDIR HKLM "${UNINSTKEY}" "InstallLocation"
  ReadRegStr $R1 HKLM "${UNINSTKEY}" "DisplayVersion"
  ${If} $INSTDIR == ""
  ${OrIfNot} ${FileExists} "$INSTDIR\${APPEXE}"
  ${OrIfNot} ${FileExists} "$INSTDIR\resources\app.asar"
    MessageBox MB_OK|MB_ICONSTOP "Es wurde keine Haushaltsbuch-Installation gefunden.$\r$\nBitte zuerst das vollständige Setup installieren." /SD IDOK
    Abort
  ${EndIf}

  ; Passt das Update zur installierten Grundversion (gleiche Laufzeit)?
  StrLen $R2 "${SERIES}."
  StrCpy $R3 $R1 $R2
  ${If} $R3 != "${SERIES}."
    MessageBox MB_OK|MB_ICONSTOP "Dieses Update ist für Version ${SERIES}.x gedacht, installiert ist $R1.$\r$\nBitte das vollständige Setup verwenden." /SD IDOK
    Abort
  ${EndIf}

  ; Neuere oder gleiche Version schon installiert?
  ${VersionCompare} "$R1" "${VERSION}" $R4
  ${If} $R4 == 1
    MessageBox MB_OK|MB_ICONINFORMATION "Installiert ist bereits die neuere Version $R1." /SD IDOK
    Abort
  ${ElseIf} $R4 == 0
    MessageBox MB_YESNO|MB_ICONQUESTION "Version ${VERSION} ist bereits installiert. Trotzdem erneut einspielen?" /SD IDNO IDYES again
    Abort
  ${EndIf}
  again:
FunctionEnd

; Läuft das Haushaltsbuch noch?
Function CheckRunning
  retry:
  ; 1. Prozessliste, 2. offenes Programmfenster (Electron-Fensterklasse + Titel)
  nsExec::ExecToStack 'cmd /c tasklist /NH | find "${APPEXE}"'
  Pop $0
  Pop $1
  FindWindow $2 "Chrome_WidgetWin_1" "${APPNAME}"
  ${If} $0 == 0
  ${OrIf} $2 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Das Haushaltsbuch ist noch geöffnet.$\r$\nBitte schließen und dann „Wiederholen“ klicken." /SD IDCANCEL IDRETRY retry
    Abort
  ${EndIf}
FunctionEnd

Section "Update"
  SetRegView 64
  Call CheckRunning

  SetOutPath "$INSTDIR\resources"
  Delete "$INSTDIR\resources\app.asar.new"
  Delete "$INSTDIR\resources\app.asar.old"
  ClearErrors
  File "/oname=app.asar.new" "${ASAR}"
  IfErrors fail

  Rename "$INSTDIR\resources\app.asar" "$INSTDIR\resources\app.asar.old"
  IfErrors fail
  Rename "$INSTDIR\resources\app.asar.new" "$INSTDIR\resources\app.asar"
  IfErrors restore
  Delete "$INSTDIR\resources\app.asar.old"

  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  DetailPrint "Haushaltsbuch ist jetzt auf Version ${VERSION}."
  Goto done

  restore:
  ClearErrors
  Rename "$INSTDIR\resources\app.asar.old" "$INSTDIR\resources\app.asar"
  fail:
  Delete "$INSTDIR\resources\app.asar.new"
  MessageBox MB_OK|MB_ICONSTOP "Das Update konnte nicht eingespielt werden. Die bisherige Version bleibt erhalten." /SD IDOK
  Abort

  done:
SectionEnd
