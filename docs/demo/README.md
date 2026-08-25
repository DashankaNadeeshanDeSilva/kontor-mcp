# Demo transcripts

Recorded with [`tools/demo-chat.sh`](../../tools/demo-chat.sh) (needs `ANTHROPIC_API_KEY`; the Kontor server itself never talks to the network):

- `chat-stdio.md` — `kontor-agent chat` auditing the broken sample and a ZUGFeRD PDF, server spawned over stdio.
- `chat-http.md` — the same session against a Streamable HTTP host with a bearer token, plus the server's session log.

`kontor-agent audit <file>` needs no key at all — see [`packages/client/README.md`](../../packages/client/README.md).
