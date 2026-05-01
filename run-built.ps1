$ErrorActionPreference = "Stop"

$exe = Join-Path $PSScriptRoot "src-tauri\target\debug\desktop-pet-tauri-prototype.exe"
if (-not (Test-Path $exe)) {
  throw "Built executable not found. Run .\run-dev.ps1 once or build with npm run tauri build -- --debug."
}

Start-Process -FilePath $exe
