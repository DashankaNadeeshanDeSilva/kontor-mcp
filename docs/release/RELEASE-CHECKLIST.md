# Release checklist (owner runbook) — v1.0.0

Everything below the line "IRREVERSIBLE" publishes to the outside world. Prepared by Task 3.6; nothing here has been executed yet.

## 0. Preconditions (already done in the repo)

- Packages at **1.0.0** (`packages/*/package.json`, `SERVER_VERSION`, `CLIENT_VERSION`), `CHANGELOG.md` has `## [1.0.0]`, `publishConfig` (public + provenance), `mcpName`, `packages/server/server.json`.
- `.github/workflows/release.yml` (tag-triggered) exists; CI is green on `main`.
- Local sanity: `pnpm build && pnpm -r test && pnpm lint && sh tools/pack-check.sh`.

## 1. One-off setup (npm)

```sh
npm login                                   # the account that will own the org
# Create the org "kontor-mcp" at https://www.npmjs.com/org/create (free, public packages)
```

npm trusted publishing can only be configured for a package that **already exists**. First publish therefore happens once from your machine, in dependency order:

```sh
export PATH="$HOME/.local/bin:$PATH"; pnpm build
cd packages/rules  && pnpm publish --access public --no-git-checks && cd ../..
cd packages/core   && pnpm publish --access public --no-git-checks && cd ../..
cd packages/server && pnpm publish --access public --no-git-checks && cd ../..
cd packages/client && pnpm publish --access public --no-git-checks && cd ../..
```

Then, for **each** of the four packages on npmjs.com → *Settings → Publishing access → Trusted publisher → GitHub Actions*: owner `DashankaNadeeshanDeSilva`, repository `kontor-mcp`, workflow filename `release.yml` (exact, case-sensitive). From v1.0.1 on, the tag push publishes with provenance and no token.

(Alternative if you prefer the workflow to do even the first publish: create a granular access token with publish rights for the `@kontor-mcp` scope, add it as repository secret `NPM_TOKEN`, and add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the `npm` job's publish step. Remove it again after the trusted publisher is configured.)

## 2. Branch protection (GitHub → Settings → Branches → main)

Require status checks: `Lint (Biome)`, `Build & test (…)` (all six), `Security (…)`, `Conformance gate (…)`, `Docker image (…)`, `Generated ZUGFeRD PDFs (…)`.

---

## IRREVERSIBLE — 3. Tag and release

```sh
git checkout main && git pull
git tag -a v1.0.0 -m "Kontor MCP v1.0.0"
git push origin v1.0.0
```

Watch *Actions → Release*: `gates` → `npm` (skipped-if-already-published packages are fine) → `docker` → `release`. Verify:

```sh
npm view @kontor-mcp/server version                     # 1.0.0
npx -y @kontor-mcp/server </dev/null & sleep 3; kill %1  # starts (stdio)
docker run --rm ghcr.io/dashankanadeeshandesilva/kontor-mcp:latest ; echo $?   # exit 2 "KONTOR_AUTH_TOKEN is required"
```

From a clean machine (AC): `npx -y @modelcontextprotocol/inspector@latest --cli npx -y @kontor-mcp/server --method tools/list` lists 8 tools.

## IRREVERSIBLE — 4. MCP Registry

```sh
brew install mcp-publisher            # or the curl one-liner in the registry quickstart
cd packages/server
mcp-publisher validate                # server.json
mcp-publisher login github            # device flow; namespace io.github.DashankaNadeeshanDeSilva/
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.DashankaNadeeshanDeSilva/kontor-mcp"
```

## IRREVERSIBLE — 5. Smithery and mcpmarket

- Smithery takes a **public HTTPS Streamable-HTTP URL** (or an MCPB bundle). Deploy the Docker image behind a TLS proxy first (e.g. Fly.io / a VPS with Caddy), then `https://smithery.ai/new` → enter `https://<host>/mcp` — or `smithery mcp publish "https://<host>/mcp" -n dashankanadeeshandesilva/kontor-mcp`. Note: Smithery scans the server; ours answers 401 without a token, which is what their checker expects.
- mcpmarket.com: submit the GitHub URL via their "Submit" form; text in `LISTINGS.md`.

## 6. Demo GIF + announcement

- Record per `docs/demo/GIF-SCRIPT.md`, save as `docs/media/v1.0-desktop-demo.gif`, then replace the hero image line in `README.md` and commit.
- Post `docs/release/ANNOUNCEMENT.md` (LinkedIn / blog); book the AI Tinkerers Bremen slot.

## 7. After the release

- Next release: `sh tools/bump-version.sh X.Y.Z` (all nine version sites), move `## [Unreleased]` entries under `## [X.Y.Z] — date`, commit, `git tag -a vX.Y.Z -m vX.Y.Z && git push origin main vX.Y.Z`. The image is tagged `:X.Y.Z` (no `v`) and `:latest`.
- Update `docs/HANDOFF-*.md` state and close Phase 3 in `docs/IMPLEMENTATION_PLAN.md`.
