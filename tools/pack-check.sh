#!/bin/sh
# Packs every publishable package and asserts contents + size (CI gate, Task 3.6).
set -eu
cd "$(dirname "$0")/.."
out=$(mktemp -d)
for p in rules core server client; do
  (cd "packages/$p" && pnpm pack --pack-destination "$out" >/dev/null)
done
for t in "$out"/*.tgz; do
  size=$(wc -c < "$t")
  name=$(basename "$t")
  echo "$name: $size bytes"
  test "$size" -lt 3000000 || { echo "tarball too large"; exit 1; }
  tar -tzf "$t" | grep -q '^package/dist/index.js$' || { echo "$name lacks dist/index.js"; exit 1; }
  tar -tzf "$t" | grep -q '^package/README.md$' || { echo "$name lacks README.md"; exit 1; }
  if tar -tzf "$t" | grep -qE '^package/(src|test|node_modules)/'; then echo "$name ships src/test/node_modules"; exit 1; fi
done
tar -tzf "$out"/kontor-mcp-rules-*.tgz | grep -q '^package/artifacts/' || { echo "rules lacks artifacts/"; exit 1; }
tar -tzf "$out"/kontor-mcp-rules-*.tgz | grep -q '^package/pdf/' || { echo "rules lacks pdf/"; exit 1; }
tar -tzf "$out"/kontor-mcp-server-*.tgz | grep -q '^package/dist/bin.js$' || { echo "server lacks bin"; exit 1; }
tar -tzf "$out"/kontor-mcp-client-*.tgz | grep -q '^package/dist/bin.js$' || { echo "client lacks bin"; exit 1; }
rm -rf "$out"
echo "pack check OK"
