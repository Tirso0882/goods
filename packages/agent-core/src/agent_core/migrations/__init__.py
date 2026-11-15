"""Brings the agent database's schema up to date.

The migrations are the numbered `.sql` files in this package, applied in
order, each once, each in its own transaction. `schema_migrations` records the
ones applied. An advisory lock keeps two runs from applying the same file.
"""

from importlib.resources import files

import psycopg

# Any constant, as long as nothing else in the agent database uses it.
LOCK_KEY = 0x6A67_656E_7473  # "agents"


def migration_files() -> list[tuple[str, str]]:
    """Every migration as (name, SQL), in the order they apply."""
    package = files(__name__)
    return sorted(
        (entry.name, entry.read_text(encoding="utf-8"))
        for entry in package.iterdir()
        if entry.name.endswith(".sql")
    )


async def migrate(database_url: str) -> list[str]:
    """Applies the migrations not yet applied, and returns their names."""
    applied: list[str] = []
    async with await psycopg.AsyncConnection.connect(database_url, autocommit=True) as conn:
        await conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_KEY,))
        try:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " name text PRIMARY KEY,"
                " applied_at timestamptz NOT NULL DEFAULT now())"
            )
            cursor = await conn.execute("SELECT name FROM schema_migrations")
            done = {row[0] for row in await cursor.fetchall()}
            for name, statements in migration_files():
                if name in done:
                    continue
                async with conn.transaction():
                    # Trusted SQL shipped in this package, with no parameters.
                    await conn.execute(statements.encode())
                    await conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))
                applied.append(name)
        finally:
            await conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,))
    return applied
