# v0.1 — Claude Desktop manual verification (Phase 1 exit)

- **Date:** 2026-08-25
- **Tag / commits:** `v0.1.0` + fixes `43b018c`, `3938fe5` (server at `packages/server/dist/bin.js`)
- **Claude Desktop:** 1.34493.1 (macOS 15, Darwin 24.6.0), model Opus 5 · High
- **Node:** v22.18.0 at `/usr/local/bin/node`; pnpm 10.34.5
- **Preflight:** `pnpm install` / `pnpm build` / `pnpm -r test` green (rules 10, core 179, client 1, server 9). Inspector CLI: `tools/list` → 3 tools; `explain_rule BR-DE-15` found; `validate_invoice` on `broken-missing-buyer-reference.xml` → `invalid`, BR-DE-15 + BR-DE-TMP-32.
- **Desktop config:** `mcpServers.kontor` = `node …/packages/server/dist/bin.js` (absolute paths). After ⌘Q/relaunch: `kontor` toggle in the connectors menu, *Add from kontor* lists the 4 samples, *Settings → Connectors → kontor* lists the 3 tools under "Read-only tools" (annotations honoured); set to "Always allow".

## Scenarios

| # | Prompt (Desktop) | Expected | Result |
|---|---|---|---|
| S1 | attach `broken-missing-buyer-reference.xml` → "Validate this invoice" / "Ist diese Rechnung gültig?" | `validate_invoice`, UNGÜLTIG, BR-DE-15 with Leitweg-ID explanation + fix, BR-DE-TMP-32 info | **PASS** — model also produced a correct `<cbc:BuyerReference>` fix snippet ([screenshot](media/v0.1-s1-validate-broken.png)) |
| S2 | attach `valid-xrechnung-ubl.xml` → "Ist diese Rechnung gültig?" | GÜLTIG, only BR-DE-TMP-32 (info) | **PASS** — model explained *why* TMP-32 fires (line 2 lacks `cac:InvoicePeriod`); disclaimer not repeated in prose (F6) |
| S3 | attach `valid-zugferd-en16931.pdf` → "Was steht in dieser Rechnung?" | `parse_invoice`, ZUGFeRD · CII · EN16931, RE-20201121/508, totals | **FAIL as attachment** (F7: PDF bytes never reach the server; model read the rendered page instead). **PASS via local path** in the prompt: format, `factur-x.xml`, RE-20201121/508, 496,00 → 571,04 EUR ([screenshot](media/v0.1-s3-parse-zugferd.png)) |
| S4 | "Was bedeutet BR-DE-18?" | `explain_rule`, `#SKONTO#TAGE=n#PROZENT=n.nn#` format | **PASS** ([screenshot](media/v0.1-s4-explain-br-de-18.png)) |
| S5 | "explain BR-KO-16" | not found + suggestions incl. BR-CO-16 | **PASS** — suggestions BR-CO-16 / BR-CL-16 / BR-CO-06, then explained BR-CO-16 in English, no hallucinated rule |
| S6 | "Prüfe diese PDF: /private/tmp/kontor-verify/plain.pdf" (text-only PDF) | clear NG3 error, no stack trace | **PASS** — `KONTOR-PDF-NO-ATTACHMENT … (non-goal NG3)`; a non-existent path earlier gave a clean "File not found" (server kept running) |

Verdict: **Phase 1 exit criterion met** — all three tools work end-to-end in Claude Desktop with correct, readable answers.

## Recording

- `docs/media/v0.1-desktop-demo.mp4` (1280×1402, 43 s, 1.5 MB) and `v0.1-desktop-demo.gif` (800 px, 3.1 MB): scenes S1 → S3 (local path) → S4, cut from a 290 s full-screen take (raw `.mov` kept locally, git-ignored).
- Screenshots: `v0.1-s1-validate-broken.png`, `v0.1-s3-parse-zugferd.png`, `v0.1-s4-explain-br-de-18.png`.

## Findings

| ID | Status | Area | Finding |
|---|---|---|---|
| F1 | fixed (docs) | README | Inspector one-liner pulled deprecated v1 → `@latest`. |
| F2 | fixed `43b018c` | server | All sample resources listed as identical "Sample invoices" → per-resource `title`. |
| F3 | fixed `3938fe5` | server | Desktop passes attachments as `/mnt/user-data/uploads/…`; `file_path` description + "File not found" message now point to `content_base64`. |
| F4 | fixed (docs) | README | Note that tools are read-only/offline and safe for "Always allow"; first-use approval prompt. |
| F5 | open | server UX | Despite F3, the model still tries `file_path` first for attachments (one wasted round-trip). Move the hint into the *tool* description / server `instructions`; cost is already bounded by the actionable error. |
| F6 | open, minor | text summary | Disclaimer line is dropped by the model in prose. Consider leading with it or accept (present in `structuredContent`). |
| F7 | **open, high** | Desktop attachments | Attached PDFs never reach the server (no bytes, sandbox dir empty). Documented workaround: local path in the prompt (F8). Phase 2: consider a local-file discovery resource/tool and mention paths in the tool descriptions. |
| F8 | fixed (docs) | README | Document "reference PDFs by local path" for Desktop. |
| F9 | open, minor | parse output | Model guessed at mixed VAT rates although BG-23 breakdown is in the model → make `taxBreakdown` more prominent in `invoiceAnnotated` / text summary. |
| F10 | open, small | server errors | Distinguish `ENOENT` from `EACCES`/`EPERM` (macOS TCC / Full Disk Access hint) in the file error message. |

Observed timings: Opus 5 · High took ~3 min on S1 in the recorded take (memory recall + extended thinking, not server time — Inspector calls return in < 2 s). For demos use a lower effort setting.
