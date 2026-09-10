; Custom NSIS macros for the electron-builder installer.
; customInstall runs after the application payload was (supposedly) extracted; it records the architecture detection and
; whether the executable landed, so a silent install that ships only the uninstaller can be diagnosed from the file it
; leaves behind (Build Desktop prints it on the Windows arm64 runner).
!macro customInstall
  FileOpen $9 "$INSTDIR\install-debug.txt" w
  FileWrite $9 "packageArch=$packageArch$\r$\n"
  ${If} ${IsNativeARM64}
    FileWrite $9 "IsNativeARM64=1$\r$\n"
  ${Else}
    FileWrite $9 "IsNativeARM64=0$\r$\n"
  ${EndIf}
  ${If} ${IsNativeAMD64}
    FileWrite $9 "IsNativeAMD64=1$\r$\n"
  ${Else}
    FileWrite $9 "IsNativeAMD64=0$\r$\n"
  ${EndIf}
  ${If} ${RunningX64}
    FileWrite $9 "RunningX64=1$\r$\n"
  ${Else}
    FileWrite $9 "RunningX64=0$\r$\n"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FileWrite $9 "exe=present$\r$\n"
  ${Else}
    FileWrite $9 "exe=missing$\r$\n"
  ${EndIf}
  FileClose $9
!macroend
