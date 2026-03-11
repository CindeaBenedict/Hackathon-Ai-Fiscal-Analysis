#!/usr/bin/env bash
set -euo pipefail

# Build local app packages from flutter_app for:
# windows, macos, linux, android, ios, or all
#
# Usage:
#   ./scripts/package_all_local_apps.sh all
#   ./scripts/package_all_local_apps.sh windows linux android

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/flutter_app"

if [[ ! -d "$APP_DIR" ]]; then
  echo "flutter_app directory not found at: $APP_DIR"
  exit 1
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter SDK is required. Install Flutter and re-run."
  echo "https://docs.flutter.dev/get-started/install"
  exit 1
fi

TARGETS=("$@")
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS=("all")
fi

build_target() {
  local target="$1"
  case "$target" in
    windows)
      echo "==> Building Windows app..."
      flutter build windows
      ;;
    macos)
      echo "==> Building macOS app..."
      flutter build macos
      ;;
    linux)
      echo "==> Building Linux app..."
      flutter build linux
      ;;
    android)
      echo "==> Building Android APK..."
      flutter build apk --release
      ;;
    ios)
      echo "==> Building iOS app (no codesign)..."
      flutter build ios --release --no-codesign
      ;;
    *)
      echo "Unknown target: $target"
      echo "Valid targets: windows macos linux android ios all"
      exit 1
      ;;
  esac
}

cd "$APP_DIR"

echo "==> Running flutter pub get..."
flutter pub get

if [[ "${TARGETS[0]}" == "all" ]]; then
  TARGETS=(windows macos linux android ios)
fi

for t in "${TARGETS[@]}"; do
  build_target "$t"
done

echo ""
echo "Build complete. Artifacts are under:"
echo "  flutter_app/build/"
echo ""
echo "Typical outputs:"
echo "  Windows: flutter_app/build/windows/x64/runner/Release/"
echo "  macOS:   flutter_app/build/macos/Build/Products/Release/"
echo "  Linux:   flutter_app/build/linux/x64/release/bundle/"
echo "  Android: flutter_app/build/app/outputs/flutter-apk/app-release.apk"
echo "  iOS:     flutter_app/build/ios/iphoneos/ (requires signing for install)"
