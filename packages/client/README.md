# @kontor-mcp/client — `kontor-agent`

Reference MCP client for [Kontor MCP](../../README.md): shows the protocol from the client side (introspection), gives you a scriptable one-shot audit **without any LLM**, and an Anthropic agent loop with every Kontor tool bridged in and each tool call traced.

```sh
kontor-agent tools                                   # tools / resources / prompts with schemas
kontor-agent audit invoice.xml [--lang en] [--known R-1,R-2] [--json]
kontor-agent chat [-m "Prüfe /abs/path/invoice.pdf"] [--model claude-sonnet-5] [--effort high]
```

Transport is a global option: by default the bundled `@kontor-mcp/server` is spawned over **stdio**; `--url http://host:3333/mcp --token …` (or `KONTOR_AUTH_TOKEN`) talks to a running **Streamable HTTP** host, e.g. the Docker image. `--stdio <command…>` spawns any other stdio server.

| Command | Needs | Exit code |
|---|---|---|
| `tools` | a server | 0 |
| `audit <file>` | a server — no API key | **0 accept · 1 review · 2 reject · 3 error** — usable in scripts and CI |
| `chat` | a server + `ANTHROPIC_API_KEY` | 0 |

`chat` uses the Anthropic SDK's Tool Runner (`@anthropic-ai/sdk/helpers/beta/mcp` bridges MCP tool definitions 1:1 — the JSON Schemas the server publishes are what Claude sees). The trace lines are the demo of the protocol:

```
[kontor-agent 0.9.0 · stdio → node …/server/dist/bin.js · claude-sonnet-5 · effort high]
  → audit_invoice file_path=/…/broken-zugferd.pdf lang=de
  ← audit_invoice recommendation=reject · verdict=invalid · 4 findings · 412 ms
Die Rechnung ist abzulehnen: …
  [3 412 in / 388 out · stop=end_turn]
```

Defaults: `claude-sonnet-5` (`--model claude-opus-5` recommended for hard cases — ambiguous multi-invoice questions, long reasoning over many findings), adaptive thinking, effort `high`, 20 tool rounds per message, streaming; the server-side refusal fallback is enabled when an Opus 5 / Fable 5 model is selected. Interactive mode keeps the full exchange (including tool calls) as history; an empty line or Ctrl-D ends the session.

**Sovereignty note:** the Kontor *server* never touches the network. `chat` is the optional client that talks to Anthropic — what leaves your machine is exactly the tool schemas, your messages and the tool results shown in the trace. `tools` and `audit` send nothing anywhere.

See [`docs/demo/`](../../docs/demo/) for recorded transcripts over both transports.
