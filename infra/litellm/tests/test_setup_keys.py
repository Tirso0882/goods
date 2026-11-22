"""The proxy's key and budget setup, against a fake LiteLLM.

The fake keeps virtual keys by their SHA-256, as LiteLLM does, and answers
the three key management routes the setup uses, with the master key only.
Like LiteLLM, it still answers /key/info for a deleted key, as "deleted".
"""

import hashlib
import importlib.util
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from types import ModuleType
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest

MASTER_KEY = "sk-master-0123456789abcdef0123456789abcdef"
AGENT_KEY = "sk-agent-0123456789abcdef0123456789abcdef"


def load_setup() -> ModuleType:
    # A script mounted into a container, not a package: load it from its path.
    path = Path(__file__).parents[1] / "setup_keys.py"
    spec = importlib.util.spec_from_file_location("setup_keys", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


setup = load_setup()


@dataclass
class FakeLiteLLM:
    url: str = ""
    keys: dict[str, dict[str, Any]] = field(default_factory=dict)
    deleted: dict[str, dict[str, Any]] = field(default_factory=dict)
    writes: list[str] = field(default_factory=list)


@pytest.fixture
def litellm() -> Iterator[FakeLiteLLM]:
    fake = FakeLiteLLM()

    class Handler(BaseHTTPRequestHandler):
        def authorized(self) -> bool:
            if self.headers.get("authorization") == f"Bearer {MASTER_KEY}":
                return True
            self.answer(401, {"error": {"message": "Authentication Error"}})
            return False

        def do_GET(self) -> None:
            url = urlsplit(self.path)
            if not self.authorized():
                return
            if url.path != "/key/info":
                self.answer(404, {})
                return
            [token] = parse_qs(url.query)["key"]
            if token in fake.keys:
                info = {**fake.keys[token], "status": "active"}
                self.answer(200, {"key": token, "info": info})
            elif token in fake.deleted:
                info = {**fake.deleted[token], "status": "deleted"}
                self.answer(200, {"key": token, "info": info})
            else:
                self.answer(404, {"error": {"message": "Key not found in database"}})

        def do_POST(self) -> None:
            if not self.authorized():
                return
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            token = hashlib.sha256(body.pop("key").encode()).hexdigest()
            fake.writes.append(self.path)
            if self.path == "/key/generate":
                fake.keys[token] = {"spend": 0.0, **body}
            elif self.path == "/key/update" and token in fake.keys:
                fake.keys[token] |= body
            else:
                self.answer(404, {})
                return
            self.answer(200, {"key": "sk-...", **fake.keys[token]})

        def answer(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    fake.url = f"http://127.0.0.1:{server.server_address[1]}"
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield fake
    finally:
        server.shutdown()
        server.server_close()


def agent_key(fake: FakeLiteLLM) -> dict[str, Any]:
    return fake.keys[hashlib.sha256(AGENT_KEY.encode()).hexdigest()]


def test_the_agents_key_gets_a_20_usd_monthly_budget_on_the_local_model(
    litellm: FakeLiteLLM,
) -> None:
    outcome = setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)

    assert outcome == "created"
    key = agent_key(litellm)
    assert key["key_alias"] == "agent"
    assert key["max_budget"] == 20.0
    assert key["budget_duration"] == "1mo"
    assert key["models"] == ["local"]


def test_a_second_run_changes_nothing(litellm: FakeLiteLLM) -> None:
    setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)
    before = dict(agent_key(litellm))

    outcome = setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)

    assert outcome == "unchanged"
    assert litellm.writes == ["/key/generate"]
    assert agent_key(litellm) == before


def test_a_deleted_agent_key_is_created_again(litellm: FakeLiteLLM) -> None:
    setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)
    token = hashlib.sha256(AGENT_KEY.encode()).hexdigest()
    litellm.deleted[token] = litellm.keys.pop(token)

    outcome = setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)

    assert outcome == "created"
    assert agent_key(litellm)["max_budget"] == 20.0


def test_a_key_whose_budget_was_changed_by_hand_is_set_back(litellm: FakeLiteLLM) -> None:
    setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)
    agent_key(litellm)["max_budget"] = 500.0
    agent_key(litellm)["spend"] = 3.5

    outcome = setup.ensure_agent_key(litellm.url, MASTER_KEY, AGENT_KEY)

    assert outcome == "updated"
    assert agent_key(litellm)["max_budget"] == 20.0
    # The month's spend stays: setting the budget back is no reset.
    assert agent_key(litellm)["spend"] == 3.5


@pytest.mark.parametrize("bad_key", ["", "agent-0123456789abcdef0123456789abcdef", "sk-short"])
def test_an_agent_key_litellm_would_refuse_or_a_guessable_one_stops_the_setup(
    litellm: FakeLiteLLM, bad_key: str
) -> None:
    with pytest.raises(setup.SetupError):
        setup.ensure_agent_key(litellm.url, MASTER_KEY, bad_key)

    assert litellm.writes == []


def test_a_wrong_master_key_stops_the_setup(litellm: FakeLiteLLM) -> None:
    with pytest.raises(setup.SetupError, match="401"):
        setup.ensure_agent_key(litellm.url, "sk-wrong-0123456789abcdef0123456789ab", AGENT_KEY)
