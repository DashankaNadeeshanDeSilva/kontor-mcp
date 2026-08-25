#!/usr/bin/env sh
# CI gate for generated ZUGFeRD PDFs (Task 2.7): regenerate with the fixed clock, require byte-identical
# committed samples, then veraPDF PDF/A-3b (zero violations) and Mustang CLI (pdf + xml valid) on every file.
set -eu
pnpm exec tsx tools/gen-zugferd-samples.ts
git diff --exit-code --stat -- fixtures/generated packages/server/samples/generated-zugferd-en16931.pdf \
  || { echo "generated samples drifted from the committed bytes — run pnpm samples:zugferd and commit" >&2; exit 1; }
sh tools/verapdf.sh fixtures/generated/*.pdf | tee /tmp/verapdf.txt
grep -q FAIL /tmp/verapdf.txt && { echo "veraPDF reported violations" >&2; exit 1; }
for f in fixtures/generated/*.pdf; do
  out=$(sh tools/mustang.sh "$f" 2>/dev/null || true)
  n=$(printf '%s' "$out" | grep -c '<summary status="valid"' || true)
  [ "$n" -ge 3 ] || { echo "Mustang: $f not valid:"; printf '%s\n' "$out" | head -40; exit 1; }
  echo "Mustang OK $f"
done
