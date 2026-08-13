#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_IPA="${1:-$REPO_ROOT/beatclone-ipa/Beatclone.ipa}"
OUTPUT_IPA="${2:-$REPO_ROOT/dist/Beatclone-36.1.4-updated.ipa}"

fail() {
  echo "beatclone: $1" >&2
  exit 1
}

command -v node >/dev/null || fail "Node.js is required"
command -v npm >/dev/null || fail "npm is required"
command -v ditto >/dev/null || fail "ditto is required (run this on macOS)"
command -v codesign >/dev/null || fail "codesign is required (run this on macOS)"
command -v otool >/dev/null || fail "otool is required (run this on macOS)"

[ -f "$SOURCE_IPA" ] || fail "source IPA not found: $SOURCE_IPA"

UNSAFE_ENTRY="$(unzip -Z1 "$SOURCE_IPA" | awk '/^\// || /(^|\/)\.\.($|\/)/ { print; exit }')"
[ -z "$UNSAFE_ENTRY" ] || fail "source IPA contains an unsafe path: $UNSAFE_ENTRY"

WORK_DIR="$(mktemp -d /private/tmp/beatclone-repack.XXXXXX)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "beatclone: compiling bootstrap and bundled fallback payload"
if [ ! -d "$REPO_ROOT/script/node_modules" ]; then
  (cd "$REPO_ROOT/script" && npm ci --no-audit --no-fund)
fi
(cd "$REPO_ROOT/script" && npm run iOSAgent && npm run iOSPayload)

echo "beatclone: extracting source IPA"
mkdir -p "$WORK_DIR/source"
ditto -x -k "$SOURCE_IPA" "$WORK_DIR/source"

APP_COUNT="$(find "$WORK_DIR/source/Payload" -maxdepth 1 -type d -name '*.app' | wc -l | tr -d ' ')"
[ "$APP_COUNT" = "1" ] || fail "expected exactly one app in Payload, found $APP_COUNT"
APP_PATH="$(find "$WORK_DIR/source/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"

[ -f "$APP_PATH/Beatstar" ] || fail "Beatstar executable is missing"
[ -f "$APP_PATH/Frameworks/FridaGadget.dylib" ] || fail "source IPA is not an instrumented Beatclone IPA"
[ -f "$APP_PATH/Frameworks/FridaGadget.config" ] || fail "Frida Gadget configuration is missing"

CRYPTID="$(otool -l "$APP_PATH/Beatstar" | awk '/cryptid/{print $2; exit}')"
[ "$CRYPTID" = "0" ] || fail "source IPA is encrypted; a decrypted/instrumented IPA is required"

echo "beatclone: installing updated scripts"
cp "$REPO_ROOT/build/script.js" "$APP_PATH/Frameworks/script.js"
cp "$REPO_ROOT/build/fallback.js" "$APP_PATH/Frameworks/fallback.js"

PLIST="$APP_PATH/Info.plist"
plutil -replace CFBundleIdentifier -string "com.beatclone.beatstar" "$PLIST"
plutil -replace CFBundleDisplayName -string "Beatclone" "$PLIST"
plutil -replace UIFileSharingEnabled -bool true "$PLIST"
plutil -replace LSSupportsOpeningDocumentsInPlace -bool true "$PLIST"
plutil -replace CFBundleURLTypes.0.CFBundleURLName -string "com.beatclone.beatstar" "$PLIST"
plutil -replace CFBundleURLTypes.0.CFBundleURLSchemes.0 -string "beatclone" "$PLIST"

# A provisioning profile is device/account-specific. AltStore supplies a fresh
# profile while re-signing, so never redistribute the expired source profile.
rm -f "$APP_PATH/embedded.mobileprovision"

echo "beatclone: applying an ad-hoc integrity signature"
codesign --force --deep --sign - --timestamp=none "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

mkdir -p "$(dirname "$OUTPUT_IPA")"
OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_IPA")" && pwd)"
OUTPUT_ABS="$OUTPUT_DIR/$(basename "$OUTPUT_IPA")"

echo "beatclone: packaging $OUTPUT_ABS"
(
  cd "$WORK_DIR/source"
  ditto -c -k --norsrc --keepParent Payload "$OUTPUT_ABS"
)

unzip -tq "$OUTPUT_ABS" >/dev/null

echo "beatclone: built $OUTPUT_ABS"
echo "beatclone: this IPA is ad-hoc signed; AltStore must re-sign it for the target device"
