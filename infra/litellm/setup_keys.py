"""Creates the agent's virtual key on the LiteLLM proxy, with its budget.

Runs as the one-off Compose service `litellm-setup`, after the proxy is
ready, on every `up`. Standard library only, so it runs in the proxy's own
image. A second run changes nothing; a key whose settings were changed by
hand is set back, and keeps the spend it has.

Needs: LITELLM_URL, LITELLM_MASTER_KEY and AGENT_PROXY_KEY. The agent's key
comes from .env, so the agent and the proxy agree on it without a handover.
"""

import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Literal

# The agent's key: 20 USD a month (docs/design.md, Budgets), on the local
# model only. The hosted model's route joins `models` when it exists.
AGENT_KEY_SETTINGS: dict[str, Any] = {
    "key_alias": "agent",
    "max_budget": 20.0,
    "budget_duration": "1mo",
    "models": ["local"],
}
# LiteLLM refuses a virtual key that does not start with "sk-". The length
# keeps out a guessable one: `openssl rand -hex 32` gives 64 characters.
MIN_KEY_LENGTH = 32
TIMEOUT_SECONDS = 10


class SetupError(RuntimeError):
    """The key could not be set up. The message names no secret."""


def call(
    proxy_url: str, master_key: str, method: str, path: str, body: dict[str, Any] | None = None
) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(  # noqa: S310 - the URL is the proxy's, from the env
        f"{proxy_url.rstrip('/')}{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"authorization": f"Bearer {master_key}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, {}
    except (urllib.error.URLError, TimeoutError) as error:
        raise SetupError(f"{method} {path}: {error}") from None


def ensure_agent_key(
    proxy_url: str, master_key: str, agent_key: str
) -> Literal["created", "updated", "unchanged"]:
    if not agent_key.startswith("sk-") or len(agent_key) < MIN_KEY_LENGTH:
        raise SetupError(f"AGENT_PROXY_KEY must start with sk- and be {MIN_KEY_LENGTH}+ characters")
    # Looked up by its hash, so the key itself stays out of URLs and logs.
    hashed = hashlib.sha256(agent_key.encode()).hexdigest()
    status, found = call(
        proxy_url, master_key, "GET", f"/key/info?{urllib.parse.urlencode({'key': hashed})}"
    )
    if status == 404:
        write("/key/generate", proxy_url, master_key, {"key": agent_key, **AGENT_KEY_SETTINGS})
        return "created"
    if status != 200:
        raise SetupError(f"GET /key/info: HTTP {status}")
    info = found.get("info", {})
    # Only what differs: sending budget_duration again would move the reset date.
    changed = {name: want for name, want in AGENT_KEY_SETTINGS.items() if info.get(name) != want}
    if not changed:
        return "unchanged"
    write("/key/update", proxy_url, master_key, {"key": agent_key, **changed})
    return "updated"


def write(path: str, proxy_url: str, master_key: str, body: dict[str, Any]) -> None:
    status, _ = call(proxy_url, master_key, "POST", path, body)
    if status != 200:
        raise SetupError(f"POST {path}: HTTP {status}")


def main() -> int:
    try:
        outcome = ensure_agent_key(
            os.environ["LITELLM_URL"],
            os.environ["LITELLM_MASTER_KEY"],
            os.environ["AGENT_PROXY_KEY"],
        )
    except KeyError as missing:
        print(f"Set {missing.args[0]}", file=sys.stderr)
        return 1
    except SetupError as error:
        print(f"Agent key setup failed: {error}", file=sys.stderr)
        return 1
    print(f"Agent key {outcome}: 20 USD a month on the local model")
    return 0


if __name__ == "__main__":
    sys.exit(main())
