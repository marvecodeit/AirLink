#!/bin/zsh
# Bump AirLink's version in all release sources.
#
# Usage: scripts/bump-version.sh 1.0.1
# Then commit, tag v1.0.1, and push the tag.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <semver>" >&2
  exit 1
fi

VERSION="$1"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semantic version: $VERSION" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$VERSION" <<'PY'
import json
import re
import sys
from pathlib import Path

version = sys.argv[1]

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package["version"] = version
package_path.write_text(json.dumps(package, indent=2) + "\n")

tauri_path = Path("src-tauri/tauri.conf.json")
tauri = json.loads(tauri_path.read_text())
tauri["version"] = version
tauri_path.write_text(json.dumps(tauri, indent=2) + "\n")

cargo_path = Path("src-tauri/Cargo.toml")
cargo = cargo_path.read_text()
cargo, count = re.subn(
    r'(?m)^version = "[^"]*"$',
    f'version = "{version}"',
    cargo,
    count=1,
)
if count != 1:
    raise SystemExit("Could not update the Cargo.toml package version")
cargo_path.write_text(cargo)
PY

npm install --package-lock-only >/dev/null
# Update Cargo.lock's local package version.
cargo check --manifest-path src-tauri/Cargo.toml --quiet

echo "Version bumped to $VERSION."
echo "Next: git add . && git commit -m \"Release v$VERSION\""
echo "      git tag v$VERSION && git push origin main && git push origin v$VERSION"
