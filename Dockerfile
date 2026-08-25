# syntax=docker/dockerfile:1.7
# Kontor MCP — sovereign e-invoice tools for AI agents (Streamable HTTP by default).
#
# Build stage runs on the builder's native platform (pure TypeScript → JS, nothing arch-specific);
# only the runtime stage is per-target, so arm64/amd64 images never compile under QEMU.
ARG NODE_IMAGE=node:22-alpine

# ---------- build: install workspace, compile, prune to a self-contained server tree ----------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm CI=1
WORKDIR /src
RUN npm install -g pnpm@10.34.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/rules/package.json packages/rules/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
RUN pnpm build \
 && pnpm --filter @kontor-mcp/server deploy --legacy --prod /out \
 && find /out/node_modules -name '*.map' -type f -delete

# ---------- runtime: non-root, HTTP on 0.0.0.0:3333, token required ----------
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Kontor MCP" \
      org.opencontainers.image.description="Sovereign e-invoice tools (XRechnung/ZUGFeRD) for AI agents — MCP over Streamable HTTP" \
      org.opencontainers.image.source="https://github.com/DashankaNadeeshanDeSilva/kontor-mcp" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production \
    KONTOR_TRANSPORT=http \
    KONTOR_BIND=0.0.0.0 \
    KONTOR_PORT=3333
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 3333
# /healthz is unauthenticated and reveals only name/version/session count.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.KONTOR_PORT||3333)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["node", "dist/bin.js"]
