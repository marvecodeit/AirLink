# AirLink Update System

AirLink uses the official **Tauri 2 updater** with GitHub Releases as the update
feed. Update bundles are signed with a **Tauri minisign key** and verified by the
installed app before installation. GitHub Releases is only the transport; a
release is not trusted merely because it is hosted on GitHub.

## Configuration

- Repository: `https://github.com/marvecodeit/AirLink`
- Updater endpoint:
  `https://github.com/marvecodeit/AirLink/releases/latest/download/latest.json`
- Public signing key: `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- Stable bundle identifier: `com.marveltech.wifiwizard`
- Stable product/version: `src-tauri/tauri.conf.json`
- Release config: `src-tauri/release/stable.conf.json`
- Updater artifacts: generated only by release builds (`createUpdaterArtifacts`).

The updater UI lives at **Settings → Software Updates** (directly after About).
It uses the real `@tauri-apps/plugin-updater` API for check, download, progress,
signature verification, install, and relaunch. No update state is simulated.

## Signing keys

A keypair was generated outside the repository:

```
~/.tauri/airlink.key           # private key — never commit
~/.tauri/airlink.key.pub       # public key
~/.tauri/airlink.key.password  # local password file — never commit
```

File mode is `0600`. The public key is already embedded in `tauri.conf.json`.
The private key and password must be backed up securely (password manager and/or
encrypted offline storage). **If the private key or password is lost, existing
installations cannot verify future updates.** Do not generate a replacement key
for an already-published channel without a planned migration.

To inspect without printing secrets:

```bash
ls -l ~/.tauri/airlink.key ~/.tauri/airlink.key.pub ~/.tauri/airlink.key.password
```

To generate a brand-new key only when no key exists (never overwrite an existing
key):

```bash
test ! -f ~/.tauri/airlink.key
npx tauri signer generate -w ~/.tauri/airlink.key -p "CHOOSE-A-STRONG-PASSWORD"
chmod 600 ~/.tauri/airlink.key
```

The public key is the contents of `~/.tauri/airlink.key.pub`.

## GitHub Actions secrets

Configure these at:

**GitHub Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Entire contents of `~/.tauri/airlink.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for that private key |

On macOS, copy without displaying:

```bash
pbcopy < ~/.tauri/airlink.key
# paste into TAURI_SIGNING_PRIVATE_KEY

pbcopy < ~/.tauri/airlink.key.password
# paste into TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Never put these values in `.env`, source files, commits, workflow YAML, or logs.
The workflow passes them only through step-level environment variables.

No Apple signing secrets are required for the updater. Apple Developer ID signing
and notarization are separate (see below).

## Release workflow

Workflow: `.github/workflows/release.yml`

Trigger: pushing a version tag such as `v1.0.1`.

It:

1. validates that the tag, `package.json` version, and `tauri.conf.json` version
   all match;
2. builds Intel (`x86_64-apple-darwin` on `macos-13`) and Apple Silicon
   (`aarch64-apple-darwin` on `macos-14`) artifacts;
3. signs updater bundles with `TAURI_SIGNING_PRIVATE_KEY`;
4. creates a **draft** GitHub Release and uploads installers, `.app.tar.gz`
   updater bundles, `.sig` signatures, and `latest.json`;
5. publishes the draft only after both architecture builds succeed.

Ordinary pushes to `main` do not create a release. Only `v*` tags do.

The existing Linux build workflow is preserved separately in
`.github/workflows/release-linux.yml` and runs manually.

## Versioning

Semantic versioning:

- `1.0.0` — initial release
- `1.0.1` — patch
- `1.1.0` — minor
- `2.0.0` — major

Bump all release sources with:

```bash
./scripts/bump-version.sh 1.0.1
```

Then:

```bash
git add .
git commit -m "Release v1.0.1"
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

The tag push triggers the macOS release workflow. Do not create the GitHub
Release manually with different assets; let the workflow publish it.

The Beta channel (`src-tauri/release/beta.conf.json`) uses a separate bundle
identifier. Its automatic update feed is **not yet wired** to a separate beta
manifest; do not point Beta clients at stable releases without deciding on a
channel policy.

## Updating an installed copy manually

For local development/testing, bypass the updater and install the current build:

```bash
npm run update:app
```

This uses `build:mac:local`, which does not require the updater signing key, then
merges the app in place. It is not a substitute for testing the signed updater.

## Testing the signed update flow

1. Publish a real release with the workflow, for example `v1.0.1`.
2. Install the previous signed version (`v1.0.0`) on a Mac.
3. Open **Settings → Software Updates**.
4. Click **Check for Updates**.
5. Confirm the version, release notes, download progress, signature
   verification, installation, and **Restart to Update**.
6. Reopen the app and verify the installed version.

The updater must not be called fully tested until this has been done with a
published signed release. Local builds without a published feed will show a
network/404 error, which is expected.

## Recovery from signing-key issues

- **Password lost, key present:** restore the password from your password
  manager. Do not regenerate the key.
- **Private key lost:** existing installations cannot verify new updates. Ship a
  one-off manual update signed with the old key if possible, or publish a new
  channel/key and direct users to reinstall. Document the migration.
- **Signature failure in the app:** verify that the release was built by the
  workflow with the matching `TAURI_SIGNING_PRIVATE_KEY`, and that
  `plugins.updater.pubkey` matches the key pair.
- **`latest.json` 404:** publish the draft release. Draft releases are not served
  by `/releases/latest/download/...`.
- **Private repository:** GitHub release assets require authentication; the
  public AirLink repository is used here. Do not switch to a private repo without
  an authenticated update strategy.

## Apple code signing and notarization

Tauri updater signing is **not** Apple code signing. It proves that the update
came from the holder of the AirLink update key; it does not remove Gatekeeper
warnings.

For distribution:

1. Obtain a **Developer ID Application** certificate from the Apple Developer
   Program.
2. Configure Tauri macOS signing with the Developer ID identity (or CI secrets).
3. Notarize the `.app`/`.dmg` with Apple's notary service.
4. Staple the notarization ticket.
5. Keep the updater signing key separate from the Apple certificate/password.

Local development builds remain ad-hoc signed and buildable without Apple
credentials.

## GitHub CLI authentication

The repository is public. To push from this Mac, authenticate with GitHub CLI:

```bash
brew install gh
gh auth login
```

Or use Git over HTTPS with a credential helper / SSH key. Never paste a personal
access token into a tracked file.
