"""The FastAPI application: health endpoints, the case endpoints and wiring."""

import hmac
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from agent_core import (
    CaseNotFoundError,
    CaseNotOpenError,
    Message,
    ScriptedChatModel,
    SupportAgent,
    Turn,
)
from agent_service.settings import MIN_SECRET_LENGTH, Settings

logger = logging.getLogger(__name__)

# One shopper message. Longer ones are refused before any model call.
MAX_MESSAGE_LENGTH = 4000


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


class ShopperMessage(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class MessageOut(BaseModel):
    id: UUID
    role: Literal["shopper", "agent", "system"]
    content: str
    created_at: datetime

    @classmethod
    def of(cls, message: Message) -> "MessageOut":
        return cls(
            id=message.id,
            role=message.role,
            content=message.content,
            created_at=message.created_at,
        )


class TurnOut(BaseModel):
    case_id: UUID
    reply: MessageOut

    @classmethod
    def of(cls, turn: Turn) -> "TurnOut":
        return cls(case_id=turn.case_id, reply=MessageOut.of(turn.reply))


class MessagesOut(BaseModel):
    case_id: UUID
    messages: list[MessageOut]


def require_storefront_secret(settings: Settings) -> Callable[[str | None], None]:
    """A dependency that refuses any request without the storefront's secret."""
    expected = settings.storefront_secret.get_secret_value().encode()

    def check(authorization: Annotated[str | None, Header()] = None) -> None:
        scheme, _, given = (authorization or "").partition(" ")
        if (
            len(expected) < MIN_SECRET_LENGTH
            or scheme.lower() != "bearer"
            or not hmac.compare_digest(given.encode(), expected)
        ):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing or wrong secret")

    return check


CorrelationId = Annotated[UUID, Header(alias="x-correlation-id")]


def case_routes(settings: Settings, agent: SupportAgent) -> APIRouter:
    router = APIRouter(dependencies=[Depends(require_storefront_secret(settings))])

    @router.post("/cases", status_code=status.HTTP_201_CREATED)
    async def open_case(body: ShopperMessage, correlation_id: CorrelationId) -> TurnOut:
        return TurnOut.of(await agent.open_case(body.message, correlation_id))

    @router.post("/cases/{case_id}/messages")
    async def send_message(
        case_id: UUID, body: ShopperMessage, correlation_id: CorrelationId
    ) -> TurnOut:
        try:
            turn = await agent.take_turn(case_id, body.message, correlation_id)
        except CaseNotFoundError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such case") from None
        except CaseNotOpenError as error:
            raise HTTPException(status.HTTP_409_CONFLICT, f"case is {error.status}") from None
        return TurnOut.of(turn)

    @router.get("/cases/{case_id}/messages")
    async def read_messages(case_id: UUID) -> MessagesOut:
        try:
            messages = await agent.messages(case_id)
        except CaseNotFoundError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no such case") from None
        return MessagesOut(case_id=case_id, messages=[MessageOut.of(m) for m in messages])

    return router


def create_app(settings: Settings, model: BaseChatModel | None = None) -> FastAPI:
    """The service. Without a model, every turn gets the scripted reply."""
    app = FastAPI(title="Support agent", docs_url=None, redoc_url=None, openapi_url=None)
    chat_model = model or ScriptedChatModel([settings.scripted_reply], repeat=True)
    agent = SupportAgent(str(settings.database_url), chat_model)

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

    app.include_router(case_routes(settings, agent))
    return app
