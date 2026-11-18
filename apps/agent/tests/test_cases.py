"""The case endpoints: what the storefront server calls for each turn."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from agent_core import ScriptedChatModel
from agent_service.app import create_app
from agent_service.settings import Settings

SECRET = "storefront-secret-0123456789abcdef"
# Nothing listens on port 1: these requests must be refused before any query.
UNREACHABLE = "postgresql://agent:agent@127.0.0.1:1/agent"


def client(database_url: str, replies: list[str] | None = None) -> TestClient:
    settings = Settings(database_url=database_url, storefront_secret=SECRET)
    model = ScriptedChatModel(replies or ["Scripted reply"], repeat=True)
    return TestClient(create_app(settings, model=model))


def turn_headers(secret: str = SECRET) -> dict[str, str]:
    return {"authorization": f"Bearer {secret}", "x-correlation-id": str(uuid4())}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/cases"),
        ("POST", f"/cases/{uuid4()}/messages"),
        ("GET", f"/cases/{uuid4()}/messages"),
    ],
)
@pytest.mark.parametrize("secret", [None, "wrong-secret-0123456789abcdef0123"])
def test_case_endpoints_refuse_a_request_without_the_shared_secret(
    method: str, path: str, secret: str | None
) -> None:
    headers = {"x-correlation-id": str(uuid4())}
    if secret:
        headers["authorization"] = f"Bearer {secret}"

    response = client(UNREACHABLE).request(method, path, json={"message": "Hi"}, headers=headers)

    assert response.status_code == 401


def test_every_request_is_refused_while_the_secret_is_too_short() -> None:
    settings = Settings(database_url=UNREACHABLE, storefront_secret="short")
    app = TestClient(create_app(settings, model=ScriptedChatModel(["Never"])))

    response = app.post("/cases", json={"message": "Hi"}, headers=turn_headers("short"))

    assert response.status_code == 401


def test_a_case_is_opened_answered_continued_and_read_back(database_url: str) -> None:
    app = client(database_url, ["First reply", "Second reply"])

    opened = app.post("/cases", json={"message": "Where is my order?"}, headers=turn_headers())
    assert opened.status_code == 201
    case_id = opened.json()["case_id"]
    assert opened.json()["reply"]["content"] == "First reply"

    sent = app.post(
        f"/cases/{case_id}/messages", json={"message": "Order 1001"}, headers=turn_headers()
    )
    assert sent.status_code == 200
    assert sent.json()["reply"]["content"] == "Second reply"

    read = app.get(f"/cases/{case_id}/messages", headers=turn_headers())
    assert read.status_code == 200
    assert [(m["role"], m["content"]) for m in read.json()["messages"]] == [
        ("shopper", "Where is my order?"),
        ("agent", "First reply"),
        ("shopper", "Order 1001"),
        ("agent", "Second reply"),
    ]


def test_an_unknown_case_is_not_found(database_url: str) -> None:
    app = client(database_url)

    sent = app.post(f"/cases/{uuid4()}/messages", json={"message": "Hi"}, headers=turn_headers())
    read = app.get(f"/cases/{uuid4()}/messages", headers=turn_headers())

    assert (sent.status_code, read.status_code) == (404, 404)


def test_a_turn_needs_a_correlation_id(database_url: str) -> None:
    response = client(database_url).post(
        "/cases", json={"message": "Hi"}, headers={"authorization": f"Bearer {SECRET}"}
    )

    assert response.status_code == 422


def failing(database_url: str) -> TestClient:
    """A client whose model has no reply to give, so every turn fails."""
    settings = Settings(database_url=database_url, storefront_secret=SECRET)
    return TestClient(create_app(settings, model=ScriptedChatModel([])))


def test_a_failed_first_message_names_its_case_and_a_retry_answers_it(database_url: str) -> None:
    failed = failing(database_url).post(
        "/cases", json={"message": "Where is my order?"}, headers=turn_headers()
    )
    assert failed.status_code == 502
    case_id = failed.json()["case_id"]

    app = client(database_url, ["Here to help."])
    retried = app.post(
        f"/cases/{case_id}/messages",
        json={"message": "Where is my order?", "retry": True},
        headers=turn_headers(),
    )
    assert retried.status_code == 200
    assert retried.json()["reply"]["content"] == "Here to help."

    read = app.get(f"/cases/{case_id}/messages", headers=turn_headers())
    assert [(m["role"], m["content"]) for m in read.json()["messages"]] == [
        ("shopper", "Where is my order?"),
        ("agent", "Here to help."),
    ]
