Param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Targets = @("all")
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppDir = Join-Path $RootDir "flutter_app"

if (-not (Test-Path $AppDir)) {
  Write-Error "flutter_app directory not found at: $AppDir"
}

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Host "Flutter SDK is required. Install Flutter and re-run." -ForegroundColor Yellow
  Write-Host "https://docs.flutter.dev/get-started/install"
  exit 1
}

function Build-Target([string]$Target) {
  switch ($Target.ToLower()) {
    "windows" { flutter build windows; break }
    "macos"   { flutter build macos; break }
    "linux"   { flutter build linux; break }
    "android" { flutter build apk --release; break }
    "ios"     { flutter build ios --release --no-codesign; break }
    default {
      Write-Error "Unknown target: $Target. Valid targets: windows macos linux android ios all"
    }
  }
}

Set-Location $AppDir
flutter pub get

if ($Targets.Count -eq 0 -or $Targets[0].ToLower() -eq "all") {
  $Targets = @("windows", "macos", "linux", "android", "ios")
}

foreach ($t in $Targets) {
  Write-Host "==> Building $t..." -ForegroundColor Cyan
  Build-Target $t
}

Write-Host ""
Write-Host "Build complete. Artifacts are under flutter_app/build/" -ForegroundColor Green
Write-Host "Windows: flutter_app/build/windows/x64/runner/Release/"
Write-Host "macOS:   flutter_app/build/macos/Build/Products/Release/"
Write-Host "Linux:   flutter_app/build/linux/x64/release/bundle/"
Write-Host "Android: flutter_app/build/app/outputs/flutter-apk/app-release.apk"
Write-Host "iOS:     flutter_app/build/ios/iphoneos/ (requires signing for install)"
