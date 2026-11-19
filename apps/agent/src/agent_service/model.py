"""The chat model the settings choose, and whether the proxy is ready."""

import logging

import httpx
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from agent_core import ScriptedChatModel
from agent_service.settings import Settings

logger = logging.getLogger(__name__)


def proxy_base_url(settings: Settings) -> str:
    assert settings.proxy_url is not None  # noqa: S101 - the settings require it for the proxy
    return str(settings.proxy_url).rstrip("/")


def chat_model(settings: Settings) -> BaseChatModel:
    """The proxy's model, or the scripted one.

    LiteLLM speaks the OpenAI API. No sampling parameter is set, so none is
    sent: the hosted models reject them, and the local one runs on its own
    defaults. The proxy retries model calls (ADR 0009), so the client does not.
    """
    if settings.model == "scripted":
        return ScriptedChatModel([settings.scripted_reply], repeat=True)
    return ChatOpenAI(
        model=settings.proxy_model,
        base_url=f"{proxy_base_url(settings)}/v1",
        api_key=settings.proxy_key,
        timeout=settings.model_timeout_seconds,
        max_retries=0,
    )


async def proxy_answers(settings: Settings) -> bool:
    """Whether the proxy's readiness probe answers 200 within the timeout.

    LiteLLM's probe needs no key, and fails while the proxy's database is down.
    """
    url = f"{proxy_base_url(settings)}/health/readiness"
    try:
        async with httpx.AsyncClient(timeout=settings.ready_timeout_seconds) as client:
            response = await client.get(url)
    except httpx.HTTPError as error:
        logger.warning("model proxy check failed: %r", error)
        return False
    if response.status_code != httpx.codes.OK:
        logger.warning("model proxy check failed: HTTP %s", response.status_code)
        return False
    return True
