# syntax=docker/dockerfile:1
#
# One image for the Medusa server and the Medusa worker. The role comes from
# the environment at runtime:
#   server: MEDUSA_WORKER_MODE=server DISABLE_MEDUSA_ADMIN=false
#   worker: MEDUSA_WORKER_MODE=worker DISABLE_MEDUSA_ADMIN=true
# Migrations are a one-off command against this image, never part of start:
#   docker run --rm <env> <image> ./node_modules/.bin/medusa db:migrate
#
# Build from the repo root: docker build -f apps/backend/Dockerfile .
#
# Both FROM lines use the same node image. Dependabot bumps them together;
# they are literal because it does not resolve ARGs in FROM.

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    MEDUSA_DISABLE_TELEMETRY=true
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS build
# Manifests first, so dependency layers survive source-only changes. Every
# workspace manifest is needed for the frozen lockfile check.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY apps/storefront/package.json apps/storefront/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store
# The root package holds the ESLint plugin that `medusa build` lints with.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store \
      --filter goods --filter "@dtc/backend..."
COPY apps/backend apps/backend
# The Admin build (Vite) needs more heap than Node's default on small builders.
# DISABLE_MEDUSA_ADMIN stays unset here so the Admin is built into the image.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @dtc/backend build
# A production-only node_modules pinned by the workspace lockfile. The build
# output has no lockfile of its own, so installing there would be unpinned.
# pnpm 10 only deploys from the lockfile with injected workspace packages;
# the legacy mode re-resolves versions.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @dtc/backend deploy --prod --offline \
      --config.inject-workspace-packages=true \
      --store-dir /pnpm/store /prod/backend

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ENV NODE_ENV=production \
    MEDUSA_DISABLE_TELEMETRY=true \
    PORT=9000
# Not /app: Medusa serves the Admin under /app.
WORKDIR /server
COPY --from=build --chown=node:node /prod/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/backend/.medusa/server ./
COPY --chown=node:node apps/backend/healthcheck.mjs ./
# The local file provider writes uploads here when S3 is not configured.
RUN mkdir -p static && chown node:node static
USER node
EXPOSE 9000
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "healthcheck.mjs"]
CMD ["./node_modules/.bin/medusa", "start"]
