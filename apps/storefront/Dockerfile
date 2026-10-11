# syntax=docker/dockerfile:1
#
# Builds without a running backend and without a publishable key. Runtime env
# (server-only, read at start):
#   MEDUSA_BACKEND_URL      backend as seen from this container, e.g. http://medusa-server:9000
#   MEDUSA_PUBLISHABLE_KEY  key created by `medusa db:migrate` or in Admin
# Build args are inlined into the browser bundle, so they must be public values.
#
# Build from the repo root: docker build -f apps/storefront/Dockerfile .

ARG NODE_IMAGE=node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
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
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store \
      --filter "@dtc/storefront..."
COPY apps/storefront apps/storefront
# The browser calls the backend at this URL. Server code uses MEDUSA_BACKEND_URL.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
ARG NEXT_PUBLIC_DEFAULT_REGION=pl
ARG NEXT_PUBLIC_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_STRIPE_KEY=
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_STRIPE_KEY=${NEXT_PUBLIC_STRIPE_KEY} \
    NODE_ENV=production
RUN pnpm --filter @dtc/storefront build

FROM ${NODE_IMAGE} AS runtime
# Docker sets HOSTNAME to the container ID, and server.js binds to HOSTNAME.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8000 \
    HOSTNAME=0.0.0.0
WORKDIR /storefront
COPY --from=build /repo/apps/storefront/.next/standalone ./
COPY --from=build /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build /repo/apps/storefront/public ./apps/storefront/public
# Next writes its fetch and page cache under .next at runtime.
RUN chown -R node:node apps/storefront/.next
USER node
EXPOSE 8000
# Ready means the key is set and the backend answers (see src/app/api/health).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/storefront/server.js"]
