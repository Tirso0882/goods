# syntax=docker/dockerfile:1
#
# The agent service: the FastAPI shell with agent-core, installed from the
# workspace lockfile. It holds no secret: the database URL comes from the
# environment at runtime.
#
# Build from the repo root: docker build -f apps/agent/Dockerfile .
#
# The build and runtime FROM lines use the same Python image, and its patch
# version matches .python-version. Dependabot bumps the two FROM lines
# together and skips Python minors (3.13), which requires-python forbids; copy
# a patch bump to .python-version. The uv image's version is also pinned in
# the CI agent job. They are literal because Dependabot does not resolve ARGs
# in FROM.

FROM ghcr.io/astral-sh/uv:0.13.8@sha256:5cc1805e2426484abca4ad46ea783bab281fdb225fd82d8ce6d66a81254bac85 AS uv

FROM python:3.12.16-slim-trixie@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS build
COPY --from=uv /uv /usr/local/bin/uv
# Compile bytecode at build time, copy files out of the cache mount, and use
# the image's Python instead of downloading one.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/agent
WORKDIR /repo
# Manifests first, so the dependency layer survives source-only changes. uv
# reads every workspace member's manifest, so evals' comes too.
COPY pyproject.toml uv.lock .python-version ./
COPY apps/agent/pyproject.toml apps/agent/
COPY packages/agent-core/pyproject.toml packages/agent-core/
COPY evals/pyproject.toml evals/
RUN --mount=type=cache,id=uv-cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-workspace --package agent-service
COPY apps/agent apps/agent
COPY packages/agent-core packages/agent-core
# Non-editable: the runtime image has no /repo.
RUN --mount=type=cache,id=uv-cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable --package agent-service

FROM python:3.12.16-slim-trixie@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS runtime
ENV PATH=/opt/agent/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AGENT_PORT=8080
COPY --from=build /opt/agent /opt/agent
COPY apps/agent/healthcheck.py /opt/healthcheck.py
# nobody: the service writes nothing to disk.
USER 65534:65534
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "/opt/healthcheck.py"]
CMD ["python", "-m", "agent_service"]
