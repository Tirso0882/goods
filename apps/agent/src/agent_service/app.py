"""The FastAPI application: health endpoints and wiring."""

import logging

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agent_service.settings import Settings

logger = logging.getLogger(__name__)


async def database_answers(settings: Settings) -> bool:
    """Whether the agent database answers `select 1` within the timeout."""
    timeout = settings.ready_timeout_seconds
    try:
        async with await psycopg.AsyncConnection.connect(
            str(settings.database_url),
            connect_timeout=max(1, round(timeout)),
            options=f"-c statement_timeout={round(timeout * 1000)}",
        ) as connection:
            await connection.execute("select 1")
    except psycopg.Error as error:
        # The reason goes to the log only: the response names no host or role.
        logger.warning("agent database check failed: %s", error)
        return False
    return True


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Support agent", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        checks = {"database": "ok" if await database_answers(settings) else "unavailable"}
        healthy = all(result == "ok" for result in checks.values())
        return JSONResponse(
            {"status": "ok" if healthy else "unavailable", "checks": checks},
            status_code=200 if healthy else 503,
        )

    return app
