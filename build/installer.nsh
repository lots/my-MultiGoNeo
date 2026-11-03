; Per-user .sgf association for the NSIS installer.
; electron-builder's fileAssociations option requires perMachine=true, while
; MultiGo Neo installs per-user without an elevation prompt, so register the
; ProgID directly under HKCU here.

!include "LogicLib.nsh"

!macro customInstall
  WriteRegStr HKCU "Software\Classes\.sgf" "" "MultiGoNeo.SGF"
  WriteRegStr HKCU "Software\Classes\.sgf" "Content Type" "application/x-go-sgf"
  WriteRegStr HKCU "Software\Classes\.sgf\OpenWithProgids" "MultiGoNeo.SGF" ""
  WriteRegStr HKCU "Software\Classes\MultiGoNeo.SGF" "" "Go game record"
  WriteRegStr HKCU "Software\Classes\MultiGoNeo.SGF\Application" "ApplicationName" "MultiGo Neo"
  WriteRegStr HKCU "Software\Classes\MultiGoNeo.SGF\DefaultIcon" "" "$INSTDIR\MultiGo Neo.exe,0"
  WriteRegStr HKCU "Software\Classes\MultiGoNeo.SGF\shell\open\command" "" "$\"$INSTDIR\MultiGo Neo.exe$\" $\"%1$\""
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.sgf" ""
  ${If} $0 == "MultiGoNeo.SGF"
    DeleteRegKey HKCU "Software\Classes\.sgf"
  ${Else}
    DeleteRegValue HKCU "Software\Classes\.sgf\OpenWithProgids" "MultiGoNeo.SGF"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\MultiGoNeo.SGF"
!macroend
