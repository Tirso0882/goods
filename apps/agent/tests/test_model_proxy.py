"""The agent behind the model proxy: what it sends to the proxy, and its readiness.

A fake proxy on a local port stands in for LiteLLM. It answers the readiness
probe and the chat completions route the way LiteLLM does, and keeps every
request it was sent.
"""

import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agent_service.app import create_app
from agent_service.settings import Settings

PROXY_KEY = "sk-agent-0123456789abcdef0123456789abcdef"
SECRET = "storefront-secret-0123456789abcdef"
# Nothing listens on port 1, so the connection is refused at once.
UNREACHABLE_DATABASE = "postgresql://agent:agent@127.0.0.1:1/agent"
UNREACHABLE_PROXY = "http://127.0.0.1:1"
# What a request without sampling parameters may carry.
ALLOWED_REQUEST_FIELDS = {"model", "messages", "stream"}


@dataclass
class FakeProxy:
    url: str
    ready: bool = True
    reply: str = "Your order is on its way."
    requests: list[tuple[str, dict[str, str], dict[str, Any]]] = field(default_factory=list)


@pytest.fixture
def proxy() -> Iterator[FakeProxy]:
    fake = FakeProxy(url="")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health/readiness" and fake.ready:
                self.answer(200, {"status": "connected", "db": "connected"})
            else:
                self.answer(503, {"status": "unhealthy", "db": "Not connected"})

        def do_POST(self) -> None:
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length))
            headers = {name.lower(): value for name, value in self.headers.items()}
            fake.requests.append((self.path, headers, body))
            self.answer(
                200,
                {
                    "id": "chatcmpl-1",
                    "object": "chat.completion",
                    "created": 0,
                    "model": body["model"],
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": fake.reply},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 7, "total_tokens": 19},
                },
            )

        def answer(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: Any) -> None:
            pass  # keep the test output clean

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    fake.url = f"http://127.0.0.1:{server.server_address[1]}"
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield fake
    finally:
        server.shutdown()
        server.server_close()


def proxy_settings(database_url: str, proxy_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        storefront_secret=SECRET,
        model="proxy",
        proxy_url=proxy_url,
        proxy_key=PROXY_KEY,
    )


def turn_headers() -> dict[str, str]:
    return {"authorization": f"Bearer {SECRET}", "x-correlation-id": str(uuid4())}


def test_a_message_is_answered_by_the_proxy_with_the_agents_key(
    database_url: str, proxy: FakeProxy
) -> None:
    app = TestClient(create_app(proxy_settings(database_url, proxy.url)))

    response = app.post("/cases", json={"message": "Where is my order?"}, headers=turn_headers())

    assert response.status_code == 201
    assert response.json()["reply"]["content"] == "Your order is on its way."
    [(path, headers, body)] = proxy.requests
    assert path.endswith("/chat/completions")
    assert headers["authorization"] == f"Bearer {PROXY_KEY}"
    assert body["model"] == "local"
    assert body["messages"][-1] == {"role": "user", "content": "Where is my order?"}


def test_the_model_request_carries_no_sampling_parameters(
    database_url: str, proxy: FakeProxy
) -> None:
    app = TestClient(create_app(proxy_settings(database_url, proxy.url)))

    app.post("/cases", json={"message": "Where is my order?"}, headers=turn_headers())

    [(_, _, body)] = proxy.requests
    assert set(body) <= ALLOWED_REQUEST_FIELDS


def test_readiness_fails_when_the_proxy_is_unreachable(database_url: str) -> None:
    app = TestClient(create_app(proxy_settings(database_url, UNREACHABLE_PROXY)))

    response = app.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "checks": {"database": "ok", "proxy": "unavailable"},
    }


def test_readiness_fails_when_the_proxy_is_not_ready(database_url: str, proxy: FakeProxy) -> None:
    proxy.ready = False
    app = TestClient(create_app(proxy_settings(database_url, proxy.url)))

    response = app.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["proxy"] == "unavailable"


def test_readiness_passes_when_the_database_and_the_proxy_answer(
    database_url: str, proxy: FakeProxy
) -> None:
    app = TestClient(create_app(proxy_settings(database_url, proxy.url)))

    response = app.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "proxy": "ok"}}


def test_readiness_names_both_failures_without_a_database() -> None:
    app = TestClient(create_app(proxy_settings(UNREACHABLE_DATABASE, UNREACHABLE_PROXY)))

    response = app.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"] == {"database": "unavailable", "proxy": "unavailable"}


@pytest.mark.parametrize(
    "missing",
    [{"proxy_url": None}, {"proxy_key": ""}],
)
def test_the_proxy_model_needs_the_proxy_url_and_key(missing: dict[str, str | None]) -> None:
    given: dict[str, Any] = {
        "database_url": UNREACHABLE_DATABASE,
        "model": "proxy",
        "proxy_url": UNREACHABLE_PROXY,
        "proxy_key": PROXY_KEY,
    }

    with pytest.raises(ValidationError):
        Settings(**(given | missing))
