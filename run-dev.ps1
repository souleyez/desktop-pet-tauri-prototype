$ErrorActionPreference = "Stop"

$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) {
  throw "Visual Studio C++ Build Tools not found. Install Microsoft.VisualStudio.2022.BuildTools with VCTools."
}

$command = "call `"$vcvars`" && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && npm run tauri dev"
cmd.exe /c $command
