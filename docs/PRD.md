# Kontor MCP — Product Requirements Document (PRD)

**Project:** Kontor MCP — The Sovereign E-Rechnung MCP Server & Client
**Working name:** `kontor-mcp` (npm scope placeholder: `@kontor/*`) — *"Kontor" is the Hanseatic word for a trading office; rename is a one-line change if desired.*
**Author:** Dashanka (with Claude)
**Status:** Draft v1.0 — Source of Truth
**Date:** 2026-08-25
**License (proposed):** Apache-2.0 (patent grant, enterprise-friendly; final decision pending)
**Companion document:** `IMPLEMENTATION_PLAN.md` (build phases, tasks, acceptance criteria)

---

## 1. Introduction

Kontor MCP is an open-source **Model Context Protocol (MCP) server and reference client** that gives AI agents first-class, fully local capabilities for German/EU electronic invoicing (**E-Rechnung**): parsing, validating, auditing, generating, and converting invoices in the **XRechnung** and **ZUGFeRD/Factur-X** formats defined by the European e-invoicing standard **EN 16931**.

The project has two purposes:

1. **A genuinely useful product.** Since 1 January 2025, every German business is legally required to be able to receive structured e-invoices, with issuing obligations phasing in through 2028. Millions of Mittelstand companies, accountants, and developers now handle XML invoices governed by hundreds of formal business rules — and the existing AI-agent tooling for this is either cloud-tethered (invoice data leaves the machine) or unofficially validated (hand-rolled approximations of the rules). Kontor closes that gap: **authoritative, KoSIT-grade validation that runs 100% offline, with zero API keys, packaged as MCP tools any agent can use.**

2. **A portfolio showcase.** The project demonstrates end-to-end MCP engineering — a production-quality server (stdio + Streamable HTTP transports, auth, tools/resources/prompts, structured output) *and* a custom client (CLI agent loop built on the MCP SDK) — targeted at the exact problem space (sovereign, DSGVO-compliant enterprise AI agents for the German market) of HUB.KI / JAAI Group.

### 1.1 In plain English — what is Kontor MCP and how does it work?

Kontor MCP is a small program you run on your own computer (or company server) that teaches an AI assistant how to handle German electronic invoices. Once connected, you can simply talk to your assistant: *"Check this invoice — is it valid?"*, *"What does error BR-DE-15 mean?"*, *"Create an invoice for this customer."* Behind the scenes, the assistant calls Kontor's tools, which read the invoice file, check it against the official German and European rulebooks, explain any problems in normal language, and can also create new, fully compliant invoices — as XRechnung XML or as a ZUGFeRD PDF.

It works via the **Model Context Protocol (MCP)** — an open standard that lets AI applications (Claude Desktop, Claude Code, agent platforms, and others) plug in external tools. Kontor ships both halves: the **server** (the toolbox) and a small **client** (a command-line assistant that uses the toolbox). Everything — the rulebooks, the checks, the invoice data — stays on your machine. No cloud service, no account, no API key, no data leaving your network.

### 1.2 One-liner

> **Kontor MCP** — the sovereign e-invoice toolkit for AI agents. Official XRechnung/EN 16931 validation, ZUGFeRD in and out, 100% offline, zero API keys.

---

## 2. The Problem

### 2.1 The legal context (why now)

Germany's **Wachstumschancengesetz** made structured electronic invoicing mandatory for domestic B2B transactions, on this timeline:

| Date | Obligation |
|---|---|
| **1 Jan 2025** | All German businesses must be able to **receive** e-invoices (EN 16931-compliant structured formats). Paper/plain-PDF only allowed during transition with recipient consent. |
| **1 Jan 2027** | Businesses with prior-year turnover **> €800,000** must **issue** e-invoices for domestic B2B. |
| **1 Jan 2028** | **All** businesses must issue e-invoices for domestic B2B. |
| Since Nov 2020 (B2G) | Suppliers to German public sector must submit **XRechnung** (with a **Leitweg-ID** routing identifier) via portals such as ZRE/OZG-RE. |

> **Note for implementation:** verify the exact current legal parameters (turnover threshold, transition rules) against an authoritative source (e.g. BMF guidance, e-rechnung-bund.de) at build time and cite them in the README. Do not hard-code legal claims without a source and a "last verified" date.

### 2.2 The technical pain

An e-invoice is not "a PDF". It is a structured XML document governed by:

- **EN 16931** — the European semantic standard defining ~160 business terms (BT-1 = invoice number, BT-27 = seller name, …) grouped into business groups (BG-x), plus ~100+ business rules (BR-*, BR-CO-* calculation rules, BR-S/E/Z/AE-* VAT category rules).
- **Two XML syntaxes**: OASIS **UBL 2.1** and UN/CEFACT **CII** (D16B).
- **XRechnung** — the German CIUS (Core Invoice Usage Specification) of EN 16931, maintained by **KoSIT** (Koordinierungsstelle für IT-Standards, Bremen!), adding German national rules (**BR-DE-\***) such as mandatory payment details, contact info, and Leitweg-ID for B2G. Current major version line: **XRechnung 3.x**.
- **ZUGFeRD 2.x / Factur-X** — a hybrid format: a human-readable **PDF/A-3** with the machine-readable CII XML embedded as an attachment. Profiles: MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED, XRECHNUNG.
- **Codelists** — UN/ECE unit codes, ISO 4217 currencies, UNTDID 5305 tax categories, EAS scheme identifiers, etc.

Consequences for real businesses:

- **Receiving side (the acute 2025+ pain):** an invoice arrives (email attachment, portal download). Is it valid? Which profile? Are the totals arithmetically consistent? Is the IBAN plausible? Is the VAT treatment correct? Can I import it, or must I reject it and ask the supplier for a corrected one? An invalid e-invoice can jeopardize input-VAT deduction (Vorsteuerabzug).
- **Issuing side (2027/2028):** producing XML that passes ~250 formal rules is hard without specialized software; error messages from validators are cryptic (`[BR-DE-15] ... Buyer reference MUST be provided`), reference XPath locations, and are meaningless to non-experts.
- **Privacy constraint:** invoices contain personal data, bank details, prices, and trade relationships. Many companies (and effectively all regulated ones) cannot ship this data to a third-party cloud API just to validate it. **DSGVO/GDPR and procurement policies demand local or on-premise processing.**

### 2.3 The AI-agent gap (competitive landscape)

AI agents are the natural interface for this problem ("check this invoice and tell me what's wrong, then draft the reply to the supplier") — but the current MCP landscape has a hole:

| Existing solution | Type | Limitation |
|---|---|---|
| eleata-einvoice-mcp | MCP wrapper → hosted API | Invoice data leaves the machine; API key required |
| zugferd-validator.de (`zugferd-mcp-client`) | MCP client → hosted REST API | Same: cloud validation, API key, quota |
| InvoiceXML, thelawin.dev, Scribo | Commercial APIs with MCP endpoints | Cloud, paid tiers |
| einvoice-mcp (community, Node) | Local MCP server | Hand-rolled rule checks, not the official EN 16931/KoSIT Schematron; limited ZUGFeRD PDF handling |
| mcp-einvoicing-de (community, Python) | Local MCP server | Partial Schematron; official KoSIT validation only via optional *remote* call |
| KoSIT Validator, Mustang, node-zugferd | Libraries/tools (no MCP or partial) | Not agent-native; KoSIT tool requires Java; no workflow layer |

**Nobody offers: authoritative (official Schematron rule sets) + fully offline + agent-workflow-complete + both MCP protocol halves done properly.** That is Kontor's position.

### 2.4 Why "sovereign" is the wedge

The differentiation is not a feature list — it is a *trust posture* that mirrors what German enterprises demand from AI platforms (and what HUB.KI sells: GDPR-compliant, EU, SaaS-to-on-premise):

- **Zero network calls at runtime.** All schemas, rules, and knowledge bases are bundled. This is enforced by an automated test (see NFR-2).
- **Zero accounts, zero API keys, zero telemetry.**
- **Official rules, not approximations.** The same EN 16931 and KoSIT XRechnung Schematron rule sets used by the authoritative validators — executed locally.
- **Runs anywhere Node runs** — laptop, air-gapped server, on-prem container. No Java required at runtime (Java is used only in CI as a conformance oracle).

---

## 3. Goals, Non-Goals, Success Criteria

### 3.1 Goals

- **G1:** Ship an MCP **server** exposing high-quality tools for parsing, validating, auditing, explaining, generating, and converting EN 16931 e-invoices (XRechnung UBL/CII + ZUGFeRD), fully offline.
- **G2:** Achieve **verdict parity with the official KoSIT validator** on the official XRechnung test suite (validated continuously in CI; conformance table published in README).
- **G3:** Ship a minimal but real MCP **client**: a CLI that connects over stdio or Streamable HTTP, lists tools, and runs an Anthropic-API agent loop — proving command of both halves of the protocol.
- **G4:** Support **both transports** (stdio for Claude Desktop/Claude Code; Streamable HTTP with bearer-token auth for remote/containerized use).
- **G5:** Publish publicly: GitHub (excellent README, architecture diagram, demo GIF), npm packages, listings on MCP directories (mcpmarket.com, Smithery, official MCP registry).
- **G6:** Deliver a 60-second demo: broken ZUGFeRD PDF in → audited, explained in plain German, supplier rejection email drafted, corrected XRechnung generated and re-validated green — all local.

### 3.2 Non-Goals (v1)

- **NG1:** Not an invoicing application (no invoice numbering sequences, customer DB, dunning, GoBD archiving).
- **NG2:** No transmission: no Peppol network access point, no ZRE/OZG-RE submission, no email sending. (The agent host — e.g. Claude with a Gmail connector — handles transport; Kontor handles the document.)
- **NG3:** No OCR of scanned paper invoices / unstructured PDFs. Input must contain structured XML (bare XML or embedded in ZUGFeRD PDF). A clear error message points users to the scope.
- **NG4:** No full Peppol BIS 3.0 country-rule matrix beyond what EN 16931/XRechnung cover (Peppol-specific rules = v2 candidate).
- **NG5:** No tax advice. Tools report formal/arithmetic findings; wording must avoid legal-advice claims (see NFR-7).

> **In scope (was previously a stretch goal):** ZUGFeRD **PDF/A-3 generation** is a v1.0 requirement — `generate_invoice` produces both XRechnung XML and ZUGFeRD PDFs (see T5 and R9).

### 3.3 Success criteria / metrics

- **S1 (Correctness):** 100% verdict agreement (valid/invalid) with the KoSIT validator on the official XRechnung test suite; ≥95% agreement on individual rule-ID findings (documented diffs allowed).
- **S2 (Sovereignty):** automated test proves zero network I/O during any tool execution.
- **S3 (Performance):** parse+validate a typical invoice in **< 2 s** on a laptop (cold start < 5 s including XSLT engine init).
- **S4 (DX):** one-command install (`npx @kontor/server`), copy-paste Claude Desktop config block, Docker one-liner.
- **S5 (Showcase):** README with architecture diagram + demo GIF; live demo delivered at AI Tinkerers Bremen; repo linked in the HUB.KI application.

---

## 4. Users & User Stories

### 4.1 Personas

- **P1 — Accounts-payable clerk at a Mittelstand company** (via an agent platform like HUB.KI or Claude Desktop): receives supplier invoices, must accept/reject them, doesn't read XML or rule IDs.
- **P2 — Freelancer / small business owner:** must issue compliant invoices to B2G or (from 2027/28) B2B customers; uses Claude to draft and validate them.
- **P3 — Developer / AI engineer:** builds agent workflows (n8n, LangChain, HUB.KI workflows, Claude Code) and needs reliable, local e-invoice primitives.
- **P4 — Compliance/IT lead at a regulated company:** evaluates whether an AI tool touching invoice data is deployable; needs the sovereignty guarantees in writing.

### 4.2 User stories (v1 scope)

- **US1 (P1):** *As an AP clerk, I drop an invoice file into my agent chat and ask "Is this invoice okay?" and get a plain-language verdict: what's wrong, how severe, and what to tell the supplier.* → `audit_invoice`, `parse_invoice`, `validate_invoice`
- **US2 (P1):** *When an invoice is invalid, I want a ready-to-send rejection email (German, polite, citing the concrete problems) drafted for me.* → prompt `draft-supplier-rejection` + audit findings
- **US3 (P2):** *As a freelancer, I describe my invoice in natural language and receive a valid XRechnung XML file I can submit, including the Leitweg-ID for a public-sector customer.* → `generate_invoice` (with internal validate-and-fix loop)
- **US4 (P3):** *As a developer, I call `validate_invoice` and receive machine-readable findings (rule ID, severity, XPath, message, fix hint) as structured output I can branch on.* → structured content + `outputSchema`
- **US5 (P3):** *As a developer, I run the server in Docker behind my firewall and connect my agent over HTTP with a bearer token.* → Streamable HTTP transport + auth
- **US6 (P1/P2):** *I paste a cryptic error like `BR-DE-18` and get an explanation in German or English with the exact fields to fix.* → `explain_rule`
- **US7 (P2):** *I ask "do the e-invoice rules even apply to me?" with my company situation and get the obligation timeline that applies.* → `check_obligations`
- **US8 (P1):** *I have a ZUGFeRD PDF but my ERP wants XRechnung XML — convert it.* → `convert_invoice`
- **US9 (P4):** *I need to verify the tool makes no network calls and processes everything locally before approving it.* → README sovereignty section + reproducible no-network test

---

## 5. Product Overview & Architecture

### 5.1 Components (pnpm monorepo)

```
kontor/
├── packages/
│   ├── core/        # @kontor/core   — format detection, parse, validate, generate, convert (pure library, no MCP)
│   ├── rules/       # @kontor/rules  — bundled artifacts: XSDs, precompiled Schematron XSLTs, codelists, rule knowledge base
│   ├── server/      # @kontor/server — MCP server (stdio + Streamable HTTP), tools/resources/prompts
│   └── client/      # @kontor/client — "kontor-agent" CLI: MCP client + Anthropic agent loop
├── fixtures/        # test invoices: official XRechnung testsuite (submodule/fetched), ZUGFeRD samples, hand-made broken invoices
├── tools/           # build-time scripts: schematron→XSLT compilation, artifact fetch/verify, oracle runner
├── docs/            # architecture diagram, this PRD, IMPLEMENTATION_PLAN.md, CONFORMANCE.md
└── .github/workflows/  # CI: lint, test, conformance-oracle, release
```

**Design rule:** `@kontor/core` is a standalone, MCP-free TypeScript library (usable in any Node project — doubles the audience and the credibility). `@kontor/server` is a thin MCP adapter over core. `@kontor/rules` isolates all standards artifacts and their licensing/versioning.

### 5.2 The validation pipeline (technical heart)

Three layers, executed in order, results merged into one findings list:

1. **Layer 1 — Structure:** well-formedness check + **XSD validation** (UBL 2.1 / CII D16B schemas). Engine: `xmllint-wasm` (WASM libxml2 — no native compilation, portable) — if performance is inadequate, fall back to `libxmljs2` (native) behind the same interface.
2. **Layer 2 — Business rules (the differentiator):** **Schematron** validation using the *official* rule sets:
   - EN 16931 rules (BR-*, BR-CO-*, BR-S/E/Z/…): from the CEN/ConnectingEurope `eInvoicing-EN16931` repository (UBL + CII variants).
   - XRechnung German rules (BR-DE-*, BR-DEX-*): from KoSIT's XRechnung Schematron / validator configuration.
   - **Execution strategy:** Schematron files are compiled to **XSLT at build time** (SchXslt, Java — build-time only), the compiled XSLTs are compiled to SEF and bundled in `@kontor/rules`, and executed at **runtime with Saxon-JS** (pure-JS XSLT 3.0 engine). → authoritative rules, zero Java at runtime.
3. **Layer 3 — Plausibility & beyond-spec checks (agent value-add):**
   - Decimal-safe recomputation of line extensions, tax breakdown, and document totals (`decimal.js`; never float arithmetic on money).
   - **IBAN** mod-97 checksum (`ibantools`), BIC format.
   - **USt-IdNr** (DE VAT ID) format check; Steuernummer basic format.
   - **Leitweg-ID** structural + check-digit validation (ISO 7064 MOD 97-10) when B2G indicators are present.
   - VAT-rate sanity for DE (19 / 7 / 0 + category-code consistency: S/Z/E/AE/K/G/O/L/M).
   - Date sanity (issue date not in future beyond tolerance; due date ≥ issue date; period consistency).
   - Optional duplicate detection: caller may pass a list of known invoice numbers/hashes; tool flags collisions (no persistence in the server — stateless).

**Finding model (canonical across all layers):**

```ts
interface Finding {
  ruleId: string;          // e.g. "BR-DE-15", "XSD", "KONTOR-PLAUS-IBAN"
  severity: "fatal" | "error" | "warning" | "info";
  source: "xsd" | "schematron-en16931" | "schematron-xrechnung" | "plausibility";
  location?: string;       // XPath into the source XML
  message: string;         // original validator message
  explanation?: { de: string; en: string };  // from knowledge base, if available
  fixHint?: { de: string; en: string };
  bt?: string[];           // related business terms, e.g. ["BT-10"]
}
```

### 5.3 The semantic model

Parsing normalizes UBL and CII into one **EN 16931 semantic JSON** keyed by human-friendly names *and* BT codes, e.g.:

```json
{
  "invoiceNumber":      { "bt": "BT-1",  "value": "RE-2026-0815" },
  "issueDate":          { "bt": "BT-2",  "value": "2026-08-01" },
  "typeCode":           { "bt": "BT-3",  "value": "380" },
  "currency":           { "bt": "BT-5",  "value": "EUR" },
  "buyerReference":     { "bt": "BT-10", "value": "04011000-12345-67" },
  "seller":  { "bg": "BG-4", "name": {"bt":"BT-27","value":"…"}, "vatId": {"bt":"BT-31","value":"DE123456789"}, "...": "..." },
  "lines":   [ { "bg": "BG-25", "...": "..." } ],
  "totals":  { "lineExtension": {"bt":"BT-106","value":"1000.00"}, "taxExclusive": {}, "taxInclusive": {}, "payable": {"bt":"BT-115"} }
}
```

Full BT/BG coverage is required for EN 16931 core; the exact TypeScript types live in `@kontor/core` (`InvoiceModel`) with Zod schemas mirrored in the MCP tool input/output schemas.

### 5.4 MCP server design

- **SDK:** `@modelcontextprotocol/sdk` (TypeScript), latest stable at build time. `McpServer` high-level API, Zod schemas for all tool inputs, **`outputSchema` + `structuredContent`** for all machine-readable results (with human-readable text fallback in `content`).
- **Transports:**
  - **stdio** (default; Claude Desktop / Claude Code / kontor-agent local mode).
  - **Streamable HTTP** (`/mcp` endpoint; Express): session management per spec, **Origin header validation**, bind to `127.0.0.1` by default, **Bearer-token auth** via `KONTOR_AUTH_TOKEN` env (constant-time compare). OAuth 2.1 resource-server metadata = v1.1 stretch.
- **Tool annotations:** every tool declares `title`, `readOnlyHint`, `destructiveHint: false`, `idempotentHint`, `openWorldHint: false` (no external world interaction — reinforces the offline story).
- **File input convention:** every document-consuming tool accepts **either** `file_path` (absolute path; server must validate existence, size cap, extension) **or** `content_base64` + `content_type`. Size cap default 20 MB (configurable). Rationale: Claude Desktop/Code pass file paths naturally; HTTP clients pass base64.
- **Logging:** MCP logging capability (`notifications/message`) at sensible levels; never log invoice contents by default (`KONTOR_LOG_PAYLOADS=1` opt-in for debugging).
- **Progress:** long validations (large invoices / batch) emit progress notifications.
- **Language:** all tool results support `lang: "de" | "en"` (default `"de"` — the audience is German) for explanations; raw validator messages are passed through unchanged.

### 5.5 Tools (functional requirements)

> All tools: stateless, offline, deterministic. Input via Zod schemas; outputs both as `structuredContent` (matching `outputSchema`) and readable text summary. Errors are returned as MCP tool errors with actionable messages (never stack traces).

**T1. `parse_invoice`** — *"What is this document and what does it say?"*
- **Input:** `{ file_path? , content_base64?, content_type?, lang? }`
- **Behavior:** detect container (bare XML vs PDF); if PDF → extract embedded XML (ZUGFeRD/Factur-X attachment: `factur-x.xml`/`zugferd-invoice.xml`/`xrechnung.xml`); detect syntax (UBL/CII), standard (EN 16931), CIUS (XRechnung + version from customization ID), ZUGFeRD profile.
- **Output:** `{ format: {container, syntax, standard, cius, profile, version, customizationId}, invoice: InvoiceModel, warnings: Finding[] }`
- **Edge cases:** PDF without embedded XML → clear error naming NG3 (no OCR); multiple embedded files → pick invoice XML by name/relationship, report others; encrypted PDF → error.

**T2. `validate_invoice`** — *"Is it formally valid?"*
- **Input:** `{ file_path?/content_base64?, profile_override?, skip_layers?, lang? }`
- **Behavior:** full 3-layer pipeline (5.2). Rule set auto-selected from detected format (EN 16931-only for plain EN invoices; + BR-DE for XRechnung; profile-appropriate subset for ZUGFeRD profiles below EN 16931 — MINIMUM/BASIC WL get structure checks + clear note that they are not full invoices for VAT purposes).
- **Output:** `{ verdict: "valid" | "invalid" | "valid_with_warnings", findings: Finding[], stats: {fatal, error, warning, info}, ruleSets: [{name, version}] }`

**T3. `audit_invoice`** — *the showcase composite* — *"Tell me everything, so a human can decide."*
- **Input:** same as T2 + `{ known_invoice_numbers?: string[] }`
- **Behavior:** parse + validate + all plausibility checks + summarize: header facts (who, what, how much, when due), verdict, findings grouped by severity with explanations, and a recommendation block (`accept` / `reject_with_reasons` / `review`).
- **Output:** structured audit report; text content renders a compact human-readable report (agent narrates on top).

**T4. `explain_rule`**
- **Input:** `{ rule_id, lang? }`
- **Behavior:** offline lookup in the rule knowledge base (`@kontor/rules`): official text, plain-language explanation (DE+EN), affected BTs, fix hint, common causes. Unknown ID → nearest-match suggestion + graceful fallback with the raw Schematron text if present.
- **KB scope:** hand-curated entries for the ~40 highest-frequency rules (all BR-DE-*, top BR-CO-* arithmetic rules, top VAT-category rules); auto-generated baseline entries (from Schematron message text) for the rest. Frequency source: findings across the official test suite + judgment.

**T5. `generate_invoice`**
- **Input:** `InvoiceInput` (Zod: seller, buyer, lines, VAT breakdown inputs, payment details, optional Leitweg-ID/buyerReference, …) + `{ target: "xrechnung-ubl" (default) | "zugferd-pdf", zugferd_profile?: "EN16931" (default) | "BASIC" | "EXTENDED" }`
- **Behavior (common):** compute all derived amounts (decimal-safe) → **internal validate loop**: run T2 on the produced XML; if findings, attempt deterministic auto-fixes (rounding representation, missing defaulted fields) once; if still invalid, return the artifact *plus* the findings and an explicit `valid: false` — **the tool never silently returns an invalid invoice as valid**.
- **`xrechnung-ubl`:** emit UBL 2.1 with the pinned XRechnung customization ID.
- **`zugferd-pdf` (v1.0 requirement):** emit a **ZUGFeRD 2.x / Factur-X hybrid PDF**: (1) serialize the semantic model to CII XML for the chosen profile; (2) render a clean human-readable invoice PDF (reuse the `html-preview` layout as the visual source of truth); (3) produce a **PDF/A-3** with the XML embedded as an attachment with the correct filename (`factur-x.xml`), `AFRelationship`, MIME type, and the required **XMP extension-schema metadata** (Factur-X/ZUGFeRD conformance level markers). Implementation path: evaluate the `node-zugferd` library first vs. a custom pdf-lib + XMP implementation (decide in Phase 0, record in DECISIONS.md). Embedded XML is validated via T2; **PDF/A-3 container conformance is verified with veraPDF in CI** (not at runtime, to preserve the no-Java/no-native runtime rule).
- **Output:** `{ artifact: string (xml) | base64 (pdf), format, valid: boolean, findings: Finding[], summary }`. Also supports writing to `output_path` when given.

**T6. `convert_invoice`**
- **Input:** source document + `{ target: "xrechnung-ubl" | "cii" | "html-preview" | "extract-xml" }`
- **Behavior v1:** `extract-xml` (ZUGFeRD PDF → bare XML), `html-preview` (render a clean human-readable HTML rendering of the semantic model — for the "show me this invoice" agent moment), UBL↔CII conversion **via the semantic model** (parse → InvoiceModel → serialize), with a mandatory post-conversion validation and honest loss-reporting for extension fields that don't round-trip.
- **Output:** converted artifact + validation verdict + `lossReport`.

**T7. `check_obligations`**
- **Input:** `{ role: "issuer"|"receiver", counterparty: "b2b"|"b2g", annual_revenue_eur?, date?, small_business_19_ustg?, cross_border? }`
- **Behavior:** offline decision-tree over the mandate timeline (2.1): what applies, from when, which format obligations, whether Leitweg-ID/buyer reference is needed. Every answer carries the "last verified" date of the embedded legal data + non-advice disclaimer (NFR-7).
- **Output:** structured obligations + plain-language summary.

**T8. `list_capabilities`** *(tiny but high-leverage)*
- Returns supported formats/profiles/versions, bundled rule-set versions, KB stats, and the sovereignty statement. Lets agents (and reviewers) introspect exactly what this server can do.

### 5.6 MCP resources

- `kontor://samples/{name}` — curated sample invoices: `valid-xrechnung-ubl.xml`, `valid-zugferd-en16931.pdf`, `broken-missing-leitweg.xml`, `broken-vat-math.xml`, … (used by the demo and by users to test drive).
- `kontor://reference/rules` — the rule knowledge-base index.
- `kontor://reference/codelists/{list}` — unit codes, tax categories, EAS, payment means codes (agents constantly need these for generation).
- `kontor://reference/cheatsheet` — one-page EN 16931/XRechnung/ZUGFeRD orientation (markdown).

### 5.7 MCP prompts

- `audit-incoming-invoice` — arguments: file reference; instructs the agent to run T3 and present a decision-ready summary for an AP clerk.
- `draft-supplier-rejection` — arguments: audit findings, tone; drafts a polite German rejection email citing concrete rule violations and asking for a corrected invoice (explicitly *drafts only* — sending is the host's job, cf. NG2).
- `create-invoice-interview` — walks a small-business user through the minimal EN 16931/XRechnung field set, then calls T5.

### 5.8 Client: `kontor-agent` (CLI)

Purpose: prove the client half of MCP; usable as a demo and a smoke-test harness. Kept deliberately small (~300–500 LOC).

- **Connect:** `--stdio "npx @kontor/server"` (spawns server) or `--url http://…/mcp --token …` (Streamable HTTP).
- **Commands:**
  - `kontor-agent tools` — list tools/resources/prompts with schemas (protocol introspection demo).
  - `kontor-agent audit <file>` — one-shot: calls T3 directly (no LLM needed — works without an API key).
  - `kontor-agent chat` — interactive agent loop: Anthropic Messages API with the MCP tools bridged in; streams responses; prints tool calls/results in a readable trace (this trace *is* the demo of understanding the protocol).
- **Config:** `ANTHROPIC_API_KEY` env for chat mode only; model configurable, sensible default.

### 5.9 Distribution & operations

- **Install paths:** `npx @kontor/server` (stdio, zero-config); Claude Desktop/Code config snippet in README; `docker run -p 3333:3333 -e KONTOR_AUTH_TOKEN=… kontor/server` for HTTP mode.
- **Config surface (env vars):** `KONTOR_TRANSPORT` (stdio|http), `KONTOR_PORT`, `KONTOR_BIND`, `KONTOR_AUTH_TOKEN`, `KONTOR_LANG_DEFAULT`, `KONTOR_MAX_FILE_MB`, `KONTOR_LOG_LEVEL`, `KONTOR_LOG_PAYLOADS`.
- **Versioning:** semver. **Pin and surface standard versions** (e.g. "XRechnung 3.0.x, EN 16931 rule release YYYY-MM, ZUGFeRD 2.x profiles") in `list_capabilities`, README badge, and `CONFORMANCE.md`. Standards updates → minor releases with changelog.

---

## 6. Non-Functional Requirements

- **NFR-1 Correctness:** conformance gate in CI (Java KoSIT validator as oracle) must pass before release (S1 thresholds).
- **NFR-2 Sovereignty:** zero runtime network I/O — enforced by an automated test that runs the full tool suite with network access monitored/blocked and fails on any attempted connection. Documented in README ("How we prove it").
- **NFR-3 Performance:** S3 targets; Saxon-JS engine and compiled stylesheets initialized once and cached across tool calls.
- **NFR-4 Portability:** Node ≥ 20, macOS/Linux/Windows; no native compilation required in the default install (prefer WASM/pure-JS deps); Docker image (multi-stage, non-root user, `linux/amd64` + `linux/arm64`).
- **NFR-5 Security:**
  - Path-input hygiene: resolve + verify `file_path`, enforce size caps, reject special files; no shell interpolation anywhere.
  - XML hardening: **disable DTD processing and external entity resolution** (XXE), entity-expansion limits (billion-laughs), depth/size limits — for *every* XML parse in every layer.
  - PDF hardening: treat embedded files as untrusted bytes; never execute; cap decompressed size.
  - HTTP transport: localhost bind by default, Origin validation, constant-time token compare, no session data persisted.
  - No telemetry of any kind.
- **NFR-6 Privacy (DSGVO posture):** no invoice data is stored, logged (by default), or transmitted; the server is stateless between calls; document this as a processing statement in README for P4 evaluators.
- **NFR-7 Non-advice:** user-facing explanation texts state findings are formal/technical checks, not tax or legal advice; `check_obligations` output carries source + "last verified" date.
- **NFR-8 Quality bar:** TypeScript `strict`; ESLint + Prettier (or Biome); ≥85% coverage on `core`; every tool has: schema tests, happy-path test, ≥3 edge-case tests; CHANGELOG; conventional commits.
- **NFR-9 Docs:** README (hero section, sovereignty statement, 60-sec GIF, architecture diagram (Mermaid), install matrix, tool reference, conformance table, FAQ); `CONFORMANCE.md`; `SECURITY.md`; `CONTRIBUTING.md`.
- **NFR-10 i18n:** all curated KB texts and audit summaries in DE + EN; `lang` param respected consistently.

---

## 7. Standards Artifacts, Sources & Licensing

| Artifact | Source (verify at build time) | Use | License action |
|---|---|---|---|
| EN 16931 Schematron (UBL + CII) | CEN TC434 / ConnectingEurope `eInvoicing-EN16931` (GitHub) | Layer-2 rules | **Verify license**; if redistribution-compatible → bundle; else fetch at build/install with checksum pinning |
| XRechnung Schematron + validator configuration | KoSIT (`itplr-kosit` GitHub: `xrechnung-schematron`, `validator-configuration-xrechnung`) | Layer-2 BR-DE rules; CI oracle config | same |
| KoSIT Validator (Java) | `itplr-kosit/validator` (Apache-2.0) | **CI oracle only** | build/CI dependency, not runtime |
| XRechnung test suite | `itplr-kosit/xrechnung-testsuite` | Conformance corpus | fixtures (submodule or fetched) |
| UBL 2.1 XSD | OASIS | Layer-1 | bundle (OASIS terms permit) — verify |
| CII D16B XSD | UNECE | Layer-1 | verify + bundle/fetch |
| ZUGFeRD samples & spec | FeRD / Mustang project samples | fixtures, profile detection | verify each sample's license |
| Codelists (UN/ECE Rec 20/21, UNTDID 5305, EAS, ISO 4217) | official publications / KoSIT bundles | KB + generation | verify + bundle |

**Rule:** every third-party artifact gets an entry in `packages/rules/PROVENANCE.md` (source URL, version, retrieval date, license, checksum). If any license blocks redistribution, the fallback is a `postinstall`/first-run fetch script with pinned checksums (still offline *after* install; document clearly).

---

## 8. Key Design Decisions (accepted)

- **D1: TypeScript everywhere; no Java at runtime.** Java appears only in build (Schematron→XSLT compile) and CI (oracle). *Rationale: portability, npm-native distribution, engineering-showcase value.*
- **D2: Official Schematron over hand-rolled rules.** Correctness and authority are the product. Hand-written checks only in Layer 3, clearly namespaced `KONTOR-PLAUS-*`.
- **D3: Semantic-model pivot for conversion.** UBL↔CII goes through `InvoiceModel`, accepting documented loss at the extension fringe, rather than fragile direct XSLT mapping.
- **D4: Stateless server.** No DB, no cache of user data; duplicate detection takes caller-provided context. *Rationale: sovereignty story, trivial horizontal scaling, no DSGVO storage questions.*
- **D5: Fail-honest generation.** T5 never claims validity it hasn't verified (internal validation loop; explicit `valid` flag).
- **D6: German-first UX, English-complete.** Default `lang: "de"`; full EN parity.
- **D7: Monorepo with a standalone core library.** `@kontor/core` must be useful without MCP.
- **D8: Engine fallback is a feature.** If the pure-TS Schematron path underperforms (Phase 0 spike), ship dual engines: `KONTOR_ENGINE=pure` (default) | `kosit` (optional local Java sidecar) — never a cloud fallback.

## 9. Open Decisions (need Dashanka's call, defaults proposed)

- **O1: Final name.** Default: **Kontor** (`kontor-mcp`, npm `@kontor/*` if free — else `@kontor-mcp/*` or unscoped `kontor-mcp-server`). Check npm/GitHub availability before first publish.
- **O2: License.** Default: **Apache-2.0**.
- **O3: XRechnung version pin.** Default: **current 3.x release at Phase-1 start** (check KoSIT for the release valid in 2026 and record in `CONFORMANCE.md`).
- **O4: Repo visibility timing.** Default: public from day one (green-field history is part of the showcase).
- **O5: ZUGFeRD PDF generation in v1.0? — DECIDED (2026-08-25): yes, in v1.0.** Both extraction and generation ship in v1.0 (see T5, R9, and Implementation Plan Task 2.7).

---

## 10. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Saxon-JS cannot execute compiled KoSIT/EN16931 XSLTs (features, perf) | Medium | High (core differentiator) | **Phase 0 spike before anything else**; fallbacks: (a) SchXslt-compiled XSLT 2→transpile constructs, (b) alternative JS Schematron runners, (c) D8 dual-engine with Java sidecar |
| R2 | License blocks bundling of a rule set | Low-Med | Medium | Provenance audit in Phase 0; checksum-pinned fetch-at-install fallback (§7) |
| R3 | Rule-set/XRechnung version churn | Certain (annual) | Medium | Pin + surface versions; `tools/update-rules` script; CI job that detects upstream releases |
| R4 | CII↔UBL conversion edge-case lossiness | Medium | Medium | Semantic-model pivot + mandatory post-validate + explicit `lossReport`; scope EXTENDED-profile fidelity out of v1 |
| R5 | Scope creep (Peppol, OCR, sending, archiving) | High | Medium | Non-goals section is binding; park ideas in `ROADMAP.md` |
| R6 | Similar projects improve meanwhile | Medium | Low-Med | Differentiation = conformance proof + sovereignty proof + workflow depth + both protocol halves; ship fast, demo at AI Tinkerers |
| R7 | KB curation underestimated (~250 rules) | High | Low | Two-tier KB (curated top-40 + generated baseline), §5.5 T4 |
| R8 | Windows path/encoding quirks | Medium | Low | CI matrix incl. `windows-latest`; path handling via `node:path` only |
| R9 | ZUGFeRD **PDF/A-3 + XMP conformance** is fiddly (font embedding, color profiles, XMP extension schemas, AFRelationship) | Medium-High | Medium | Evaluate `node-zugferd` before building custom; use official Factur-X XMP templates; **veraPDF as CI conformance oracle** for every generated fixture; validate against a second checker (e.g. ZUGFeRD community validator) before v1.0; if blocked near deadline, ship `zugferd-pdf` behind an "experimental" flag rather than slipping v1.0 |

---

## 11. Release & Showcase Plan (summary — detail in IMPLEMENTATION_PLAN.md)

- **v0.1 (internal):** end Phase 1 — parse/validate/explain over stdio, Claude Desktop demo works.
- **v0.9 (public beta):** end Phase 2 — full tool surface, conformance table drafted, repo public with README v1.
- **v1.0:** end Phase 3 — HTTP+auth, Docker, client CLI, CI conformance gates green (KoSIT oracle **and** veraPDF PDF/A-3 gate for generated ZUGFeRD), npm publish, MCP directory listings (mcpmarket.com, Smithery, official registry), demo GIF, announcement post (LinkedIn + AI Tinkerers Bremen live demo).
- **v1.1 candidates:** Peppol BIS rules, OAuth resource-server auth, batch tools, additional ZUGFeRD profiles/visual templates.

---

## 12. Glossary

- **E-Rechnung** — electronic invoice per German law: structured data per EN 16931 (a plain PDF is *not* an E-Rechnung).
- **EN 16931** — European norm defining the semantic invoice model (BT/BG terms) + business rules.
- **BT / BG** — Business Term / Business Group identifiers of EN 16931 (BT-1 = invoice number…).
- **XRechnung** — German CIUS of EN 16931, maintained by KoSIT; adds BR-DE rules; required for B2G.
- **KoSIT** — Koordinierungsstelle für IT-Standards (seated in Bremen) — maintains XRechnung and the reference validator.
- **ZUGFeRD / Factur-X** — hybrid PDF/A-3 + embedded CII XML format (German/French twin standards).
- **CIUS** — Core Invoice Usage Specification: a national/sectoral tightening of EN 16931.
- **UBL / CII** — the two permitted XML syntaxes (OASIS UBL 2.1; UN/CEFACT Cross-Industry Invoice).
- **Leitweg-ID** — routing identifier for German public-sector invoice recipients (B2G).
- **Schematron** — rule language for XML business-rule validation; compiles to XSLT.
- **MCP** — Model Context Protocol: open protocol connecting AI applications to tools/resources/prompts via clients and servers.
- **Streamable HTTP** — MCP's HTTP-based transport for remote servers.
- **Vorsteuerabzug** — input-VAT deduction (at risk with non-compliant invoices).

---

*End of PRD. The implementation plan (phases, tasks, acceptance criteria, test strategy, CI, publishing checklist) lives in `IMPLEMENTATION_PLAN.md`. Where the two disagree, the PRD wins on scope, the plan wins on sequencing.*
