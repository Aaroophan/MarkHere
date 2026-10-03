!define MARKHERE_PROGID "MarkHere.MarkdownDocument"
!define MARKHERE_REGISTERED_APP "MarkHere"
!define MARKHERE_CAPABILITIES "Software\MarkHere\Capabilities"

!macro RegisterMarkHereExtension EXT
  WriteRegStr HKCU "Software\Classes\${MARKHERE_PROGID}" "" "Markdown Document"
  WriteRegStr HKCU "Software\Classes\${MARKHERE_PROGID}\DefaultIcon" "" '"$INSTDIR\markhere.exe",0'
  WriteRegStr HKCU "Software\Classes\${MARKHERE_PROGID}\shell\open\command" "" '"$INSTDIR\markhere.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\markhere.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${MARKHERE_PROGID}" ""
  WriteRegStr HKCU "${MARKHERE_CAPABILITIES}\FileAssociations" ".${EXT}" "${MARKHERE_PROGID}"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\markhere.exe" "" "$INSTDIR\markhere.exe"
  WriteRegStr HKCU "Software\RegisteredApplications" "${MARKHERE_REGISTERED_APP}" "${MARKHERE_CAPABILITIES}"
  WriteRegStr HKCU "${MARKHERE_CAPABILITIES}" "ApplicationName" "MarkHere"
  WriteRegStr HKCU "${MARKHERE_CAPABILITIES}" "ApplicationDescription" "Local-first Markdown reader and editor"
  !insertmacro RegisterMarkHereExtension "md"
  !insertmacro RegisterMarkHereExtension "markdown"
  !insertmacro RegisterMarkHereExtension "mmd"
  !insertmacro RegisterMarkHereExtension "mdown"
  !insertmacro RegisterMarkHereExtension "mdtext"
  !insertmacro RegisterMarkHereExtension "mdtxt"
  WriteRegStr HKCU "Software\Classes\Applications\markhere.exe\shell\open\command" "" '"$INSTDIR\markhere.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\markhere.exe" "FriendlyAppName" "MarkHere"
  WriteRegStr HKCU "Software\Classes\Applications\markhere.exe" "NoOpenWith" ""
  DeleteRegValue HKCU "Software\Classes\Applications\markhere.exe" "NoOpenWith"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "${MARKHERE_REGISTERED_APP}"
  DeleteRegKey HKCU "${MARKHERE_CAPABILITIES}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\markhere.exe"
  DeleteRegKey HKCU "Software\Classes\Applications\markhere.exe"
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.mmd\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.mdown\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.mdtext\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegValue HKCU "Software\Classes\.mdtxt\OpenWithProgids" "${MARKHERE_PROGID}"
  DeleteRegKey HKCU "Software\Classes\${MARKHERE_PROGID}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
