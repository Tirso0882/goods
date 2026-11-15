"""Shared test fixtures: a throwaway agent database for each test, migrated from empty."""

import os
from collections.abc import AsyncIterator
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from agent_core.migrations import migrate

# A Postgres role that may create databases. CI sets it; locally the tests
# that need it are skipped without it.
TEST_DATABASE_URL = os.environ.get("AGENT_TEST_DATABASE_URL", "")


@pytest.fixture
async def database_url() -> AsyncIterator[str]:
    if not TEST_DATABASE_URL:
        pytest.skip("AGENT_TEST_DATABASE_URL is not set")
    name = f"agent_test_{uuid4().hex}"
    async with await psycopg.AsyncConnection.connect(TEST_DATABASE_URL, autocommit=True) as admin:
        await admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    # A URL, not key=value: the service's settings take only URLs.
    url = urlunsplit(urlsplit(TEST_DATABASE_URL)._replace(path=f"/{name}"))
    try:
        await migrate(url)
        yield url
    finally:
        async with await psycopg.AsyncConnection.connect(
            TEST_DATABASE_URL, autocommit=True
        ) as admin:
            await admin.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )
