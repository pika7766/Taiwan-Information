#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "請先設定 APPLE_TEAM_ID，例如：export APPLE_TEAM_ID=ABCDE12345" >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
INSTALL_DIR="$PROJECT_DIR/安裝檔"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"

cd "$PROJECT_DIR"
npm install
npm run prepare:native
mkdir -p "$BUILD_DIR" "$INSTALL_DIR"
cp scripts/ExportOptions.plist "$EXPORT_OPTIONS"
/usr/libexec/PlistBuddy -c "Set :teamID $APPLE_TEAM_ID" "$EXPORT_OPTIONS"
if [[ -n "${IOS_EXPORT_METHOD:-}" ]]; then
  /usr/libexec/PlistBuddy -c "Set :method $IOS_EXPORT_METHOD" "$EXPORT_OPTIONS"
fi

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$BUILD_DIR/TaiwanSmartLife.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$BUILD_DIR/TaiwanSmartLife.xcarchive" \
  -exportPath "$INSTALL_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

echo "iOS 安裝檔已輸出至：$INSTALL_DIR"
