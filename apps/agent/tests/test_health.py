"""The agent service's only seam: its health endpoints."""

import os

import pytest
from fastapi.testclient import TestClient

from agent_service.app import create_app
from agent_service.settings import Settings

# Nothing listens on port 1, so the connection is refused at once.
UNREACHABLE = "postgresql://agent:agent@127.0.0.1:1/agent"
# A Postgres that answers. CI sets it; locally the test is skipped without it.
TEST_DATABASE_URL = os.environ.get("AGENT_TEST_DATABASE_URL", "")


def client(database_url: str) -> TestClient:
    return TestClient(create_app(Settings(database_url=database_url)))


def test_liveness_answers_without_the_database() -> None:
    response = client(UNREACHABLE).get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_fails_when_the_agent_database_is_unreachable() -> None:
    response = client(UNREACHABLE).get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "checks": {"database": "unavailable"}}


@pytest.mark.skipif(not TEST_DATABASE_URL, reason="AGENT_TEST_DATABASE_URL is not set")
def test_readiness_passes_when_the_agent_database_answers() -> None:
    response = client(TEST_DATABASE_URL).get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}
