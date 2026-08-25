#!/bin/sh
# Records the Task 3.3 demo transcripts: kontor-agent chat auditing the broken sample over
# stdio and over Streamable HTTP. Needs ANTHROPIC_API_KEY; the Kontor server itself stays offline.
set -eu
cd "$(dirname "$0")/.."
: "${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY}"
SAMPLE="$PWD/packages/server/samples/broken-missing-buyer-reference.xml"
PDF="$PWD/packages/server/samples/valid-zugferd-en16931.pdf"
AGENT="node packages/client/dist/bin.js"
OUT=docs/demo
TOKEN=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')
MSG="Prüfe bitte diese Rechnung und sage mir, ob wir sie bezahlen dürfen: $SAMPLE — und dann die ZUGFeRD-Rechnung $PDF."

{
  echo "# kontor-agent chat — stdio transport"; echo
  echo "Recorded $(date -u +%Y-%m-%dT%H:%MZ) with \`tools/demo-chat.sh\`. Server spawned over stdio; the server made no network calls."; echo
  echo '```'; echo "$ kontor-agent chat -m \"$MSG\""
  $AGENT chat -m "$MSG" 2>&1
  echo '```'
} > "$OUT/chat-stdio.md"

KONTOR_TRANSPORT=http KONTOR_PORT=3333 KONTOR_AUTH_TOKEN="$TOKEN" node packages/server/dist/bin.js 2>"$OUT/.server.log" &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1.5
{
  echo "# kontor-agent chat — Streamable HTTP transport"; echo
  echo "Recorded $(date -u +%Y-%m-%dT%H:%MZ). Server started with \`KONTOR_TRANSPORT=http KONTOR_AUTH_TOKEN=…\`; client connected with \`--url --token\`."; echo
  echo '```'; echo "$ kontor-agent --url http://127.0.0.1:3333/mcp --token … chat -m \"$MSG\""
  $AGENT --url http://127.0.0.1:3333/mcp --token "$TOKEN" chat -m "$MSG" 2>&1
  echo '```'; echo
  echo "Server log (sessions opened/closed, no payloads):"; echo '```'; cat "$OUT/.server.log"; echo '```'
} > "$OUT/chat-http.md"
rm -f "$OUT/.server.log"
echo "wrote $OUT/chat-stdio.md and $OUT/chat-http.md"
