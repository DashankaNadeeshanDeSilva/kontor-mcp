#!/usr/bin/env sh
# veraPDF PDF/A-3b conformance check (CI/dev only; Java). Usage: pnpm verapdf <file.pdf>… [--xml]
# Requires `verapdf` on PATH (Homebrew: brew install verapdf) or VERAPDF env pointing at the binary.
set -eu
BIN="${VERAPDF:-verapdf}"
FMT=text
for a in "$@"; do [ "$a" = "--xml" ] && FMT=xml; done
set -- $(printf '%s\n' "$@" | grep -v -- '--xml')
exec "$BIN" -f 3b --format "$FMT" "$@" 2>/dev/null
