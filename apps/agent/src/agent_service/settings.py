"""Typed settings, read from AGENT_* environment variables."""

from typing import Literal, Self

from pydantic import AnyHttpUrl, PostgresDsn, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# A shorter shared secret is treated as none: every case call is refused.
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", frozen=True)

    # The agent's own database, reached with the agent's role.
    database_url: PostgresDsn
    # Readiness gives up on the database and the proxy after this long.
    ready_timeout_seconds: float = 3.0
    port: int = 8080
    # The storefront server's secret for the case endpoints. Empty or shorter
    # than MIN_SECRET_LENGTH, they refuse every call.
    storefront_secret: SecretStr = SecretStr("")

    # Which chat model answers: "proxy" is a model behind the LiteLLM proxy,
    # the only path to a model (ADR 0009). "scripted" gives every turn
    # `scripted_reply` and needs no proxy, for tests and a stack without one.
    model: Literal["scripted", "proxy"] = "scripted"
    scripted_reply: str = (
        "Thanks for your message. I'm the store's AI assistant, and I can't look up "
        "orders yet. A person will be able to help you soon."
    )
    # The proxy, the agent's own virtual key on it, and the route to call.
    # The key is all the agent holds: no provider credentials, no master key.
    proxy_url: AnyHttpUrl | None = None
    proxy_key: SecretStr = SecretStr("")
    proxy_model: str = "local"
    # One model call, the proxy's own retries included. Under the storefront's
    # 65 s wait for a turn.
    model_timeout_seconds: float = 55.0

    @model_validator(mode="after")
    def _proxy_model_needs_the_proxy(self) -> Self:
        if self.model == "proxy" and (
            self.proxy_url is None or not self.proxy_key.get_secret_value()
        ):
            raise ValueError("the proxy model needs AGENT_PROXY_URL and AGENT_PROXY_KEY")
        return self
