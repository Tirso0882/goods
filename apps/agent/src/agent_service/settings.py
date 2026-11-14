"""Typed settings, read from AGENT_* environment variables."""

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", frozen=True)

    # The agent's own database, reached with the agent's role.
    database_url: PostgresDsn
    # Readiness gives up on the database after this long.
    ready_timeout_seconds: float = 3.0
    port: int = 8080
