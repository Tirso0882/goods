"""Starts the service: `python -m agent_service`."""

import uvicorn

from agent_service.app import create_app
from agent_service.settings import Settings


def main() -> None:
    settings = Settings()  # read from the environment
    # All interfaces inside the container; Compose publishes no host port.
    uvicorn.run(create_app(settings), host="0.0.0.0", port=settings.port)  # noqa: S104


if __name__ == "__main__":
    main()
