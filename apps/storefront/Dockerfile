# syntax=docker/dockerfile:1
#
# Builds without a running backend, a key or any URL, so one image runs in every
# environment. Runtime env, read by the storefront server:
#   MEDUSA_BACKEND_URL         backend as seen from this container, e.g. http://medusa-server:9000
#   MEDUSA_PUBLISHABLE_KEY     key created by `medusa db:migrate` or in Admin
#   PUBLIC_MEDUSA_BACKEND_URL  backend as seen from the browser
#   PUBLIC_BASE_URL            this storefront's public URL
#   PUBLIC_STRIPE_KEY          Stripe publishable key (pk_test_... or pk_live_...)
#
# Build from the repo root: docker build -f apps/storefront/Dockerfile .
#
# Both FROM lines use the same node image. Dependabot bumps them together;
# they are literal because it does not resolve ARGs in FROM.

FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS base
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
# A store setting, the same in every environment. URLs and keys are runtime env.
ARG NEXT_PUBLIC_DEFAULT_REGION=pl
ENV NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NODE_ENV=production
RUN pnpm --filter @dtc/storefront build

FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runtime
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
