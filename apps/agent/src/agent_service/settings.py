"""Typed settings, read from AGENT_* environment variables."""

from pydantic import PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# A shorter shared secret is treated as none: every case call is refused.
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", frozen=True)

    # The agent's own database, reached with the agent's role.
    database_url: PostgresDsn
    # Readiness gives up on the database after this long.
    ready_timeout_seconds: float = 3.0
    port: int = 8080
    # The storefront server's secret for the case endpoints. Empty or shorter
    # than MIN_SECRET_LENGTH, they refuse every call.
    storefront_secret: SecretStr = SecretStr("")
    # Until the LiteLLM proxy is wired in, every turn gets this scripted reply.
    scripted_reply: str = (
        "Thanks for your message. I'm the store's AI assistant, and I can't look up "
        "orders yet. A person will be able to help you soon."
    )
