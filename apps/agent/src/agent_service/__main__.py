"""Starts the service: `python -m agent_service`.

`python -m agent_service migrate` brings the agent database's schema up to
date and exits. Compose runs it as a one-off before the service starts.
"""

import asyncio
import sys

import uvicorn

from agent_core.migrations import migrate
from agent_service.app import create_app
from agent_service.settings import Settings


def main() -> None:
    settings = Settings()  # read from the environment
    if sys.argv[1:] == ["migrate"]:
        applied = asyncio.run(migrate(str(settings.database_url)))
        print(f"Applied {len(applied)} migration(s): {', '.join(applied) or 'none'}")
        return
    # All interfaces inside the container; Compose publishes no host port.
    uvicorn.run(create_app(settings), host="0.0.0.0", port=settings.port)  # noqa: S104


if __name__ == "__main__":
    main()
