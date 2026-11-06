# AirLink — working agreement

## Updating the app on this Mac

The app is installed at:

```
/Applications/AirLink.app
```

When code changes are ready, **update it in place**. Do not delete or recreate
the install path.

```bash
npm run typecheck
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run update:app
```

`npm run update:app` builds the release and runs
`scripts/update-installed-app.sh`, which:

1. quits the running copy (including the old WiFi Wizard bundle),
2. renames a legacy `/Applications/WiFi Wizard.app` to `AirLink.app` once,
   then merges the new bundle over the existing app,
3. preserves `settings.json`, logs, Keychain items, and permissions,
4. reopens the app.

User data outside the bundle must survive every update:

- `~/Library/Application Support/com.marveltech.wifiwizard/`
- `~/Library/Logs/com.marveltech.wifiwizard/`
- macOS login Keychain items under `com.marvecodeit.airlink.portal.*`
- Legacy pre-rebrand WiFi Wizard Keychain items are migrated on first use

## Release channels

- Stable release: `npm run build:mac:stable` (signed updater artifacts)
- Beta release: `npm run build:mac:beta` (signed updater artifacts)
- Local in-place build: `npm run build:mac:local` (no updater signing)
- Linux: `npm run build:linux:stable` / `npm run build:linux:beta`

Beta uses the `AirLink Beta` product name and a separate bundle identifier. Do
not publish a release build unless the user asks.

## Linux

Linux uses NetworkManager/`iw` for Wi-Fi, the Secret Service for credentials,
and WebKitGTK for the embedded browser. Hotspot and Super Dev panels are hidden
there because they depend on macOS Internet Sharing and `networksetup`.
Linux bundles are `.deb` and `.AppImage`.

## Signing

Local builds are ad-hoc signed with the original stable bundle identifier
(`com.marveltech.wifiwizard`). It is intentionally retained so the AirLink
rebrand keeps macOS Location and Keychain authorization. Ad-hoc code hashes
change per build, so macOS may still ask for Keychain access again after an
update.

For a stable update identity, use a Developer ID:

```bash
AIRLINK_SIGNING_IDENTITY="Developer ID Application: …" npm run update:app
```

## Shipping updates on push

Automatic updates are implemented with the Tauri updater and GitHub Releases.
Pushing an ordinary commit does **not** publish an update. Only a `v*` tag
triggers `.github/workflows/release.yml`, which builds and signs macOS updater
artifacts, creates a draft release, and publishes it after both architectures
succeed. Never push a release tag or publish a release without the user's
explicit approval.

The updater public key is in `src-tauri/tauri.conf.json`. The private key is
outside the repository at `~/.tauri/airlink.key`; never commit or print it.
See `docs/UPDATE_SYSTEM.md`.

## Feature boundaries

- AirLink's Browser is a real WKWebView and supports local HTTP server links.
- Super Dev starts a localhost proxy and temporarily changes the active macOS
  network service's HTTP/HTTPS proxy. Always restore it when disabling, on quit,
  and on startup if a stale `.super-dev-proxy.json` marker exists.
- macOS does not expose hotspot creation, station limits, data caps, or a
  hotspot captive portal to third-party apps. Keep the Hotspot panel honest:
  guide Internet Sharing, never fake enforcement.
- Text selection and copy must work in the app chrome.

## Proof gate

Checks live in `.claude/proof.json`. Never weaken a check to make a build pass.
