; Inno Setup script for the Windows arm64 installer.
; electron-builder's NSIS installers do not work on Windows on ARM (verified on a Windows 11 arm64 runner: the legacy
; NSIS 3.0.4.1 bundle leaves only the uninstaller behind, the NSIS 3.12 bundle extracts a fraction of the files, the zip
; payload variants hang), so the arm64 installer is built with Inno Setup from the unpacked application directory.
; Defines come from the command line: /DAppVersion=... /DSourceDir=... /DOutputDir=... /DOutputBaseFilename=...

#define MyAppName "Stowly"

[Setup]
AppId={{io.github.hansbug.stowly}}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppVerName={#MyAppName} {#AppVersion}
AppPublisher=HansBug
AppPublisherURL=https://github.com/HansBug/stowly
AppSupportURL=https://github.com/HansBug/stowly/issues
; Per-user install into %LOCALAPPDATA%\Programs, like the NSIS installer of the x64 build.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\{#MyAppName}.exe
UninstallDisplayName={#MyAppName}
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppName}.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppName}.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppName}.exe"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
