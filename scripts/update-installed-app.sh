#!/bin/zsh
# Update the already-installed AirLink.app in place.
#
# - Does not delete /Applications/AirLink.app.
# - Syncs the new bundle over the existing one, preserving the install path.
# - Preserves settings, logs, saved keychain items, and macOS permissions
#   because they live outside the app bundle.
# - Quits the running copy first and reopens it afterward.
#
# For stable Keychain access across updates, sign with a real Developer ID and
# set AIRLINK_SIGNING_IDENTITY before running. Ad-hoc builds have a new code
# identity on every build, so macOS may ask for Keychain access again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${AIRLINK_SOURCE_APP:-$ROOT/src-tauri/target/release/bundle/macos/AirLink.app}"
APP_NAME="${AIRLINK_APP_NAME:-AirLink}"
DEST="${AIRLINK_INSTALL_PATH:-${WIFI_WIZARD_INSTALL_PATH:-/Applications/AirLink.app}}"
LEGACY_DEST="${AIRLINK_LEGACY_DEST-/Applications/WiFi Wizard.app}"
ENTITLEMENTS="$ROOT/src-tauri/entitlements.plist"

if [[ ! -d "$SOURCE" ]]; then
  echo "Build the app first: npm run tauri build" >&2
  exit 1
fi

echo "Updating $DEST in place…"

# Ask the app to quit, then wait for the process to exit.
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
if [[ -n "$LEGACY_DEST" ]]; then
  osascript -e 'tell application "WiFi Wizard" to quit' >/dev/null 2>&1 || true
fi
for _ in {1..40}; do
  if ! pgrep -f "/Applications/${APP_NAME}.app/Contents/MacOS/airlink" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
pkill -f "/Applications/${APP_NAME}.app/Contents/MacOS/airlink" >/dev/null 2>&1 || true
if [[ -n "$LEGACY_DEST" ]]; then
  pkill -f "/Applications/WiFi Wizard.app/Contents/MacOS/wifi-wizard" >/dev/null 2>&1 || true
fi
sleep 0.5

# Rename the legacy bundle once so the app keeps a single install path.
if [[ -n "$LEGACY_DEST" && ! -d "$DEST" && -d "$LEGACY_DEST" ]]; then
  echo "Renaming the existing install to AirLink.app…"
  mv "$LEGACY_DEST" "$DEST"
fi

if [[ ! -d "$DEST" ]]; then
  echo "Installed app not found; installing fresh at $DEST"
fi

# Sync over the existing bundle instead of removing and recreating it. The
# install path stays; stale files from the legacy executable are removed.
mkdir -p "$DEST"
/usr/bin/rsync -a --delete "$SOURCE/" "$DEST/"

# Re-sign the in-place bundle. Default is ad-hoc; set AIRLINK_SIGNING_IDENTITY
# (or legacy WIFI_WIZARD_SIGNING_IDENTITY) for a stable Developer ID identity.
SIGNING_IDENTITY="${AIRLINK_SIGNING_IDENTITY:-${WIFI_WIZARD_SIGNING_IDENTITY:--}}"
echo "Signing with ${SIGNING_IDENTITY}…"
codesign --force --deep --options runtime \
  --sign "${SIGNING_IDENTITY}" \
  --entitlements "$ENTITLEMENTS" "$DEST"
codesign --verify --deep --strict "$DEST"

# Retire the old branded bundle if it existed alongside the new one.
if [[ -n "$LEGACY_DEST" && -d "$LEGACY_DEST" && "$DEST" != "$LEGACY_DEST" ]]; then
  rm -rf "$LEGACY_DEST"
fi

open "$DEST"
echo "AirLink updated and reopened."
