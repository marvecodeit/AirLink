# AirLink

**A native macOS captive portal assistant by marvecodeit.**

AirLink helps you get past the point where campus Wi-Fi says "connected" but the internet still doesn't work. It detects captive portals, opens the network's real sign-in page in an embedded WebKit browser, verifies that your Mac actually has system-wide internet access, and watches for expired sessions.

It is a local utility. There is no account, no cloud backend, no analytics, and no telemetry.

![AirLink icon](src-tauri/icons/128x128.png)

---

## Download

| Mac | Installer |
| --- | --- |
| Apple Silicon (M1 and later) | [AirLink 1.0.0 for Apple Silicon](https://github.com/marvecodeit/AirLink/releases/download/v1.0.0/AirLink_1.0.0_aarch64.dmg) |
| Intel | [AirLink 1.0.0 for Intel](https://github.com/marvecodeit/AirLink/releases/download/v1.0.0/AirLink_1.0.0_x64.dmg) |

[All releases and SHA-256 checksums](https://github.com/marvecodeit/AirLink/releases)

The 1.0.0 builds are ad-hoc signed and not notarized. On first launch macOS
may block the app; right-click AirLink in Finder and choose **Open**, or allow
it in **System Settings → Privacy & Security**. Automatic updates are signed
separately with the AirLink updater key and verified before installation.

---

## What it does

- Reads the active Wi-Fi link with CoreWLAN and native macOS networking data:
  SSID, BSSID, RSSI, channel, band, security, IP, gateway, DNS, interface.
- Detects captive portals conservatively using HTTP interception probes and
  separate HTTPS internet probes.
- Distinguishes DNS failure, network loss, portal interception, and a clean
  internet connection instead of treating every error as a portal.
- Opens the detected portal in a real in-app WKWebView with JavaScript, cookies,
  redirects, forms, back/forward, reload, an editable address bar, and saved
  links for local Wi-Fi servers.
- Verifies sign-in with **fresh HTTPS probes over the Mac's own network path**.
  A successful form submission or browser cookie is never accepted as proof.
- Monitors the connection in the background, updates the menu bar, and sends
  native macOS notifications for portal detection, expired sessions, disconnects,
  and restored internet.
- Stores passwords in the macOS Keychain and usernames by explicit consent.
- Works as a normal browser for local `http://` server addresses over Wi-Fi,
  with saved server links.
- **Super Dev**: an optional localhost HTTP/HTTPS proxy that makes Safari and
  Chrome use AirLink for local Wi-Fi links. It restores the previous macOS proxy
  settings when turned off, on quit, or after a crash-and-restart.
- **Hotspot**: a guided macOS Internet Sharing panel with hotspot name/password
  preparation and live sharing status. macOS itself owns the access point.
- Provides trusted campus network profiles, configurable probes, appearance
  settings, launch at login, and menu bar operation.
- Keeps working with the main window closed when "Keep running in the menu bar"
  is enabled.
- **Signed automatic updates** through the Tauri updater and GitHub Releases,
  with check, release notes, download progress, signature verification, install,
  and restart available in **Settings → About → Software Updates**.

## What it deliberately does not do

- No credential auto-fill or injection into arbitrary websites.
- No TLS certificate bypass. HTTPS probes validate certificates normally.
- No hidden proxy, DNS, or MAC address changes. Super Dev changes the system
  proxy only after an explicit toggle and restores it afterward.
- No modification of system security features.
- No claim of success based on a browser cookie. If a portal uses an unsupported
  mechanism (custom protocol, native supplicant, device certificate), the app
  reports that verification failed rather than pretending.

---

## Requirements

### macOS
- macOS 12 or later (built and tested on current macOS).
- Xcode Command Line Tools (`xcode-select --install`).
- Rust 1.90+ and Cargo.
- Node.js 20+ and npm.

### Linux
- A modern desktop distribution with WebKitGTK 4.1 and NetworkManager.
- Build packages (Ubuntu 24.04):
  `build-essential pkg-config libssl-dev libdbus-1-dev
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.
- A running Secret Service provider (GNOME Keyring, KWallet, or KeePassXC)
  for credential storage.
- Rust 1.90+ and Cargo; Node.js 20+ and npm.

## Development

```bash
npm install
npm run tauri dev
```

Useful checks:

```bash
npm run typecheck   # TypeScript
npm run lint        # Biome
npm test            # Vitest
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

The project includes `.claude/proof.json` with the same type, lint, test, and
Rust checks.

## Packaging and release channels

AirLink has two release channels:

| Channel | Product | Version source | Bundle identifier |
| --- | --- | --- | --- |
| Stable | AirLink | `src-tauri/release/stable.conf.json` | `com.marveltech.wifiwizard` |
| Beta | AirLink Beta | `src-tauri/release/beta.conf.json` | `com.marveltech.wifiwizard.beta` |

Beta is a separate app with its own settings and data. It installs as
`AirLink Beta.app` so it can run alongside stable.

`build:mac:stable` and `build:mac:beta` are signed updater release builds and
require `TAURI_SIGNING_PRIVATE_KEY` plus its password. For a local in-place
build without updater artifacts use `npm run build:mac:local` (`.app` only) or
`npm run build:mac:dmg` for a local disk image.

```bash
# macOS release builds (signed updater artifacts + DMG)
npm run build:mac:stable
npm run build:mac:beta

# Local in-place build (no updater signing required)
npm run build:mac:local
npm run build:mac:dmg

# Linux (.deb + .AppImage)
npm run build:linux:stable
npm run build:linux:beta

# Channel defaults (uses tauri.conf.json bundle targets)
npm run build:stable
npm run build:beta
```

Outputs:

- `src-tauri/target/release/bundle/macos/AirLink.app` or `AirLink Beta.app`
- `src-tauri/target/release/bundle/dmg/AirLink_*.dmg`
- `src-tauri/target/release/bundle/deb/*.deb`
- `src-tauri/target/release/bundle/appimage/*.AppImage`

For distribution outside your own Mac, sign and notarize the macOS app with your
Apple Developer ID. The project builds with ad-hoc signing locally; notifications
and launch-at-login behavior are most reliable from a signed `.app` in
`/Applications`.

Linux packages are unsigned by default. Build them on the target distribution or
in the included Ubuntu 24.04 CI job so WebKitGTK and AppIndicator versions match.

The macOS release workflow at `.github/workflows/release.yml` builds and signs
updater artifacts for Apple Silicon and Intel when a `v*` tag is pushed. It
creates a draft GitHub Release, then publishes it only after both architectures
succeed. See [docs/UPDATE_SYSTEM.md](docs/UPDATE_SYSTEM.md) for signing keys,
GitHub secrets, and the release procedure. The Linux build workflow is separate
and manual.

## Linux platform notes

- Wi-Fi details come from NetworkManager (`nmcli`) with `iw`, `/sys`, and
  `ip`/`if_addrs` fallbacks. NetworkManager is strongly recommended.
- Passwords use the freedesktop.org Secret Service. A keyring provider must be
  running; otherwise AirLink reports a clear credential error.
- Browser, developer tools, user-agent, saved server links, and normal
  HTTP/HTTPS browsing work on Linux through WebKitGTK.
- macOS-only panels are hidden on Linux: **Hotspot** (macOS Internet Sharing)
  and **Super Dev** (macOS system proxy). Linux users can still browse local
  server links directly in AirLink's Browser.
- `.deb` and `.AppImage` are the supported release artifacts. Tray support needs
  an AppIndicator-compatible desktop.

## Updating an installed copy

AirLink can update the already-installed app in place without deleting it:

```bash
npm run update:app        # stable
npm run update:app:beta   # beta
```

The update script builds the release bundle, quits the running app, merges the
new bundle over `/Applications/AirLink.app` (without removing the install
path), and reopens it. Settings and credentials live outside the app bundle, so
they are preserved.

Ad-hoc signatures change on every build. If macOS asks for Keychain access
again after an update, that is why. For stable Keychain access and smoother
future updates, sign with a Developer ID and use:

```bash
AIRLINK_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
  npm run update:app
```

You can override the install location with `AIRLINK_INSTALL_PATH`.

> For a real signed updater test, publish a version tag through the release
> workflow and run **Settings → About → Software Updates** from the previous signed
> build. A local `npm run update:app` is only an in-place development install; it
> does not test the updater feed. See [docs/UPDATE_SYSTEM.md](docs/UPDATE_SYSTEM.md).

## macOS permissions and entitlements

AirLink is not sandboxed (it is designed for direct distribution outside the
Mac App Store). It includes a network-client entitlement and does not request
administrator rights.

| Permission | When it is requested | Why |
| --- | --- | --- |
| Location Services | Only when you press "Allow network names" | macOS hides Wi-Fi SSIDs from apps without Location access. AirLink doesn't record or transmit location. |
| Notifications | The first notification or the test button | Native connection alerts. |
| Login item | When you enable "Launch at login" | Registers the app with macOS LaunchAgent. |
| Local network | macOS may prompt on first local portal access | Reaching a campus portal hosted on the LAN. |

Info.plist includes `NSLocationUsageDescription`,
`NSLocationWhenInUseUsageDescription`, and `NSLocalNetworkUsageDescription`.
ATS permits insecure HTTP only inside embedded web content (`NSAllowsArbitraryLoadsInWebContent`),
as many campus portals still run on plain HTTP; HTTPS certificate validation is
never disabled.

> If the SSID stays hidden after granting Location access, quit and reopen the
> app once so CoreWLAN can read the new authorization.

---

## Architecture

```text
src/                              React + TypeScript + Tailwind CSS
  components/                     Design-system primitives and shared UI
  layouts/AppShell.tsx            macOS sidebar/titlebar shell
  pages/OverviewPage.tsx          Dashboard, portal card, diagnostics
  pages/BrowserPage.tsx           Embedded portal browser chrome + bounds sync
  pages/SettingsPage.tsx          Preferences, probes, profiles, credentials
  hooks/                          Theme, relative-time ticker
  lib/                            Formatting, status metadata
  services/api.ts                 Typed Tauri IPC wrappers
  services/events.ts              Typed event subscriptions
  stores/appStore.ts              Zustand app state and workflows
  types/                          Shared request/response types

src-tauri/src/
  main.rs                         Thin binary entry point
  lib.rs                          Tauri builder, plugins, tray/monitor setup
  app_state.rs                    Shared state, refresh machine, verification
  tray.rs                         Menu bar icon, menu, app menu, update logic
  commands/
    wifi.rs / network.rs          Status, checks, permissions
    captive_portal.rs             Detection and verification commands
    browser.rs                    Child WKWebView lifecycle and navigation
    credentials.rs                Keychain consent flow and clipboard copy
    settings.rs                   Settings persistence and launch-at-login
    diagnostics.rs                Local frontend error logging
  services/
    wifi_manager.rs               CoreWLAN + ifconfig/route/scutil fallbacks
    captive_portal_detector.rs    HTTP/HTTPS probe classification
    network_monitor.rs            Background transitions and notifications
    super_dev.rs                  Localhost HTTP/HTTPS proxy + proxy restore
    hotspot_manager.rs            Internet Sharing state and DHCP leases
    browser_manager.rs            Child webview, navigation policy, bounds
    credential_manager.rs         macOS Keychain generic passwords
    settings_manager.rs           Atomic local JSON settings
    notification_manager.rs       Native notifications
    portal_support.rs             Best-effort CNMarkPortalOnline adapter
    location_permission.rs        CoreLocation authorization helper
    shell.rs                      Safe fixed-command runners and parsers
  models/                         Typed network, portal, and settings models
  errors/                         Structured internal and IPC errors
```

Networking logic lives in services. Commands are thin adapters. The frontend
never parses terminal output and never sees a saved password. The Super Dev
proxy is a separate localhost-only forwarding service; it does not inspect TLS
or store traffic.

### Connection states

`disconnected`, `connecting`, `authentication_required`, `portal_detected`,
`authenticating`, `authenticated`, `internet_available`, `session_expired`,
`connection_error`.

The state machine in `app_state.rs` keeps a small amount of per-link state
(whether internet was previously verified, whether the SSID changed, when a
portal was last notified) so it can distinguish a fresh portal from an expired
session without polling aggressively.

### Detection methodology

HTTP probes are sent to configurable endpoints with redirects disabled:

- HTTP 3xx with a usable `Location` → portal redirect.
- HTTP 511 → authentication required.
- An HTML page replacing the expected probe response → likely portal.
- Timeouts, DNS failures, and connection failures are **not** classified as
  portals.

HTTPS probes are run separately. A successful HTTPS response is required for
`internet_available`; this is what makes verification meaningful. Default probes
are Apple, Google, and Mozilla endpoints. All are editable in Settings.

Missing DNS is reported as a DNS failure, not a portal. This keeps the app honest
when the problem is actually the local resolver or upstream network.

### Authentication verification

1. The portal page loads in the embedded WKWebView; the user signs in normally.
2. After navigation finishes, an optional quiet check runs (debounced).
3. The user can explicitly choose **Verify connection**.
4. The detector runs up to three fresh checks with short backoff.
5. Only if a live HTTPS request succeeds does the app switch to `authenticated`.
6. `CNMarkPortalOnline` is attempted as a best-effort system hint after success.
   It is a private/legacy CaptiveNetwork symbol on modern macOS and may be
   unavailable; verification does **not** depend on it.
7. If the portal still intercepts traffic, the UI reports "Not verified yet" and
   keeps the portal available.

### Browser security

- Only `http`, `https`, and `about:blank` navigation is allowed. `file:`,
  `javascript:`, `data:`, and custom schemes are blocked.
- Pop-ups and downloads are blocked inside the portal browser.
- Camera, microphone, geolocation, and other web permission requests are denied.
- TLS validation remains enabled.
- The browser identifies whether the current host is the portal domain or one
  of the profile's trusted domains. Leaving the domain shows an amber warning;
  navigation is still allowed so legitimate SSO, payment, and campus auth
  redirects are not broken.
- Cookies persist in WKWebView during the session. AirLink does not clear
  them behind your back.

### Credentials

- Passwords are stored as generic-password items in the login Keychain.
- Settings JSON contains only SSID, username, and a credential index — never a
  password.
- Saving a password requires an explicit toggle in the UI.
- Copying a password is an explicit action; the clipboard is cleared after
  60 seconds if the value is still there.
- Passwords are not returned over the IPC boundary to React.
- Password values are zeroized after use.

### Browser and local Wi-Fi links

The Browser is a real WKWebView, not an iframe. It accepts any HTTP/HTTPS URL,
supports back/forward/reload, cookies, redirects, forms, and editable addresses,
and keeps saved server links for the local Wi-Fi you use. Bare private addresses
and IP-like inputs default to `http://`; ordinary hostnames default to `https://`.

Downloads and pop-ups are still blocked, and web permission prompts (camera,
microphone, location) are denied. The portal's own JavaScript and cookies are
not altered. A **Developer Tools** button opens the Web Inspector for the
embedded browser when the build includes Tauri's devtools feature.

### Super Dev proxy

Super Dev is for local HTTP servers that system browsers refuse to open. When
enabled:

1. AirLink starts a proxy bound only to `127.0.0.1`.
2. It snapshots the active network service's HTTP and HTTPS proxy settings.
3. It points that service at the local proxy.
4. Safari/Chrome HTTP requests are forwarded; HTTPS is passed through as a
   CONNECT tunnel with end-to-end TLS.
5. Turning Super Dev off, quitting, or restarting after a crash restores the
   previous proxy state.

The proxy does not intercept certificates, log request bodies, or store browser
traffic. It is not a VPN.

### Hotspot

macOS does not expose a public API for creating a Wi-Fi access point, setting
station limits, enforcing data quotas, or serving a captive portal. AirLink's
Hotspot panel therefore uses the supported Internet Sharing workflow:

- reads the configured Internet Sharing state (including the Wi-Fi broadcast name),
- prepares a strong hotspot name/password for copying,
- opens System Settings → Sharing,
- shows source interface, bridge presence, and connected DHCP leases when macOS
  exposes them.

It deliberately does not display non-functional data-limit, max-station, or
captive-portal controls. Those require a privileged AP/network-extension stack;
AirLink reports the limitation instead of faking enforcement.

### Monitoring

- Wi-Fi link details are sampled every 8 seconds by default.
- Internet probes run every 30 seconds by default, or immediately when the link,
  SSID, or IP changes.
- A failed session is not retried in a tight loop. Browser navigation triggers at
  most one quiet verification every 8 seconds.
- Notification transitions are deduplicated per SSID/portal.

---

## Local storage

- Settings: `~/Library/Application Support/com.marveltech.wifiwizard/settings.json`
  (mode `0600`; atomic write; corrupt files are backed up as `settings.json.corrupt`).
- Logs: `~/Library/Logs/com.marveltech.wifiwizard/airlink.log`.
- Credentials: macOS login Keychain, service prefix
  `com.marvecodeit.airlink.portal.<ssid>`. Credentials saved by the pre-rebrand
  WiFi Wizard are read through their legacy service name and migrated on first use.
- The bundle identifier intentionally remains `com.marveltech.wifiwizard` so
  macOS Location Services and Keychain authorization survive the AirLink rebrand.

No passwords are ever written to logs. The app logs high-level state changes and
sanitized errors.

## Icons

The app and menu bar icons are generated from the source script:

```bash
swift scripts/generate-icons.swift src-tauri/icons
npx tauri icon src-tauri/icons/app-icon.png
```

The menu bar icon is a monochrome template; the app icon is a green tile with a
Wi-Fi + spark mark.

## Known limitations

- Campus networks using 802.1X, device certificates, or a native supplicant
  cannot be authenticated by a web portal; AirLink will correctly report
  that internet access was not verified.
- Some portals use pop-ups. They are blocked here for safety; if the sign-in flow
  depends on one, open the target link in the address bar manually.
- macOS controls SSID privacy. Without Location access the app shows a clearly
  labeled "network hidden" state and still monitors IP/internet connectivity.
- System proxy configuration is never modified. Probes bypass environment
  proxies to test the real network path.
- `CNMarkPortalOnline` availability varies by macOS version and signing setup.
  It is best-effort only.
- Hotspot data caps, station limits, and hotspot-hosted captive portals are not
  available through macOS Internet Sharing or public APIs. AirLink guides and
  monitors Internet Sharing instead.
- Super Dev changes the macOS system proxy while enabled. The previous state is
  restored on toggle-off, quit, and next launch after an abnormal exit. If the
  app is force-killed and not reopened, restore the proxy in System Settings →
  Network → your service → Details → Proxies.

## Credits

Designed and built by **marvecodeit**.

Built with Tauri 2, Rust, React, TypeScript, Vite, Tailwind CSS, and WebKit.
