#!/bin/sh
# Bump every version site in the monorepo to the same value.
# Usage: sh tools/bump-version.sh 1.2.3
# Sites: packages/*/package.json, packages/server/server.json (server version, npm package version, OCI image tag in identifier),
#        SERVER_VERSION (server-meta.ts), CLIENT_VERSION (client/connect.ts).
# packages/server/test/version-sync.test.ts asserts they all agree; the release workflow checks them against the tag.
set -eu
new="${1:?usage: sh tools/bump-version.sh X.Y.Z}"
case "$new" in *[!0-9.]*|*..*|.*|*.) echo "not a plain semver: $new" >&2; exit 1;; esac
root=$(cd "$(dirname "$0")/.." && pwd)
cur=$(node -p "require('$root/packages/server/package.json').version")
[ "$cur" != "$new" ] || { echo "already at $new"; exit 0; }
for f in packages/rules/package.json packages/core/package.json packages/server/package.json packages/client/package.json packages/server/server.json; do
  sed -i.bak "s/\"version\": \"$cur\"/\"version\": \"$new\"/g" "$root/$f" && rm "$root/$f.bak"
done
sed -i.bak "s#kontor-mcp:$cur\"#kontor-mcp:$new\"#" "$root/packages/server/server.json" && rm "$root/packages/server/server.json.bak"
sed -i.bak "s/SERVER_VERSION = \"$cur\"/SERVER_VERSION = \"$new\"/" "$root/packages/server/src/server-meta.ts" && rm "$root/packages/server/src/server-meta.ts.bak"
sed -i.bak "s/CLIENT_VERSION = \"$cur\"/CLIENT_VERSION = \"$new\"/" "$root/packages/client/src/connect.ts" && rm "$root/packages/client/src/connect.ts.bak"
echo "bumped $cur -> $new; remember: CHANGELOG.md entry '## [$new]', then commit + tag v$new"
