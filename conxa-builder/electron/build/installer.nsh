; Custom NSIS macros for Conxa Build Studio installer.
; Included by electron-builder via nsis.include in electron-builder.yml.

!macro customInstall
  ; Registry keys so IT can detect the installed version.
  WriteRegStr HKLM "Software\Conxa\BuildStudio" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\Conxa\BuildStudio" "InstallPath" "$INSTDIR"

  ; Register conxa-studio:// URI scheme for OAuth callbacks.
  WriteRegStr HKCR "conxa-studio" "" "URL:Conxa Studio Protocol"
  WriteRegStr HKCR "conxa-studio" "URL Protocol" ""
  WriteRegStr HKCR "conxa-studio\shell\open\command" "" '"$INSTDIR\Conxa Build Studio.exe" "%1"'
!macroend

!macro customUninstall
  ; --- Remove registry entries added during install ---
  DeleteRegKey HKLM "Software\Conxa\BuildStudio"
  DeleteRegKey HKCR "conxa-studio"

  ; --- Data removal ---
  ; Always keep user data (~\.conxa-build-studio\) so that recorded sessions,
  ; compiled skills, and cached packages survive a reinstall or upgrade.
  ; No prompt is shown — uninstall never deletes this directory.
!macroend
