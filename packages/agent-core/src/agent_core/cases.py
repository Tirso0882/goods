"""Support cases and their messages in the agent database.

The messages table is the only source of the conversation (ADR 0020): a turn
rebuilds the history from it, never from anything the caller sends.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import class_row

Role = Literal["shopper", "agent", "system"]
CaseStatus = Literal[
    "open", "agent_working", "awaiting_approval", "handed_off", "failed", "resolved"
]


class CaseNotFoundError(LookupError):
    """No support case has this ID."""


class CaseNotOpenError(RuntimeError):
    """The case can't take a message now: a turn is running, or it is closed."""

    def __init__(self, status: CaseStatus) -> None:
        super().__init__(f"the case is {status}")
        self.status = status


@dataclass(frozen=True)
class Message:
    id: UUID
    role: Role
    content: str
    correlation_id: UUID
    created_at: datetime


@dataclass(frozen=True)
class BegunTurn:
    """A turn under way: the conversation to answer, or a reply already stored."""

    history: list[Message]
    answered: Message | None


@dataclass(frozen=True)
class SupportCase:
    id: UUID
    status: CaseStatus
    created_at: datetime
    last_activity_at: datetime


class SupportCases:
    """Reads and writes cases and messages, one connection per call."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    async def _connect(self) -> psycopg.AsyncConnection[tuple[object, ...]]:
        return await psycopg.AsyncConnection.connect(self._database_url)

    async def create(self, correlation_id: UUID) -> UUID:
        """A new open case, created by the shopper's first message."""
        case_id = uuid4()
        async with await self._connect() as conn:
            await conn.execute(
                "INSERT INTO support_cases (id, correlation_id, actor, status)"
                " VALUES (%s, %s, 'shopper', 'open')",
                (case_id, correlation_id),
            )
        return case_id

    async def get(self, case_id: UUID) -> SupportCase:
        async with await self._connect() as conn:
            cursor = conn.cursor(row_factory=class_row(SupportCase))
            await cursor.execute(
                "SELECT id, status, created_at, last_activity_at FROM support_cases WHERE id = %s",
                (case_id,),
            )
            case = await cursor.fetchone()
        if case is None:
            raise CaseNotFoundError(case_id)
        return case

    async def messages(self, case_id: UUID) -> list[Message]:
        """The case's conversation, oldest first."""
        await self.get(case_id)
        async with await self._connect() as conn:
            cursor = conn.cursor(row_factory=class_row(Message))
            await cursor.execute(
                "SELECT id, role, content, correlation_id, created_at"
                " FROM messages WHERE case_id = %s ORDER BY seq",
                (case_id,),
            )
            return await cursor.fetchall()

    async def begin_turn(
        self, case_id: UUID, content: str, correlation_id: UUID, *, retry: bool = False
    ) -> BegunTurn:
        """Stores the shopper's message and marks the case `agent_working`.

        With `retry`, the shopper is sending again a message whose reply they
        never saw, so it is stored only if it never arrived. If it was
        answered, the stored reply is returned and the case is left as it was.
        """
        async with await self._connect() as conn:
            cursor = await conn.execute(
                "SELECT status FROM support_cases WHERE id = %s FOR UPDATE", (case_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                raise CaseNotFoundError(case_id)
            status: CaseStatus = row[0]  # type: ignore[assignment]
            if status != "open":
                raise CaseNotOpenError(status)
            last, before_last = await self._last_two(conn, case_id)
            if retry and last and last.role == "shopper" and last.content == content:
                pass  # It arrived and failed: answer it again.
            elif (
                retry
                and last
                and before_last
                and last.role == "agent"
                and before_last.role == "shopper"
                and before_last.content == content
            ):
                return BegunTurn(history=[], answered=last)
            else:
                await self._insert(conn, case_id, "shopper", content, correlation_id)
            await self._set_status(conn, case_id, "agent_working")
        return BegunTurn(history=await self.messages(case_id), answered=None)

    async def finish_turn(self, case_id: UUID, reply: str, correlation_id: UUID) -> Message:
        """Stores the agent's reply and returns the case to `open`."""
        async with await self._connect() as conn:
            message = await self._insert(conn, case_id, "agent", reply, correlation_id)
            await self._set_status(conn, case_id, "open")
        return message

    async def abandon_turn(self, case_id: UUID) -> None:
        """Returns the case to `open` after a turn that produced no reply.

        A stopgap until the `failed` state and its handoff exist.
        """
        async with await self._connect() as conn:
            await self._set_status(conn, case_id, "open")

    @staticmethod
    async def _last_two(
        conn: psycopg.AsyncConnection[tuple[object, ...]], case_id: UUID
    ) -> tuple[Message | None, Message | None]:
        """The case's last message and the one before it, if there are any."""
        cursor = conn.cursor(row_factory=class_row(Message))
        await cursor.execute(
            "SELECT id, role, content, correlation_id, created_at"
            " FROM messages WHERE case_id = %s ORDER BY seq DESC LIMIT 2",
            (case_id,),
        )
        rows = await cursor.fetchall()
        return (rows[0] if rows else None, rows[1] if len(rows) > 1 else None)

    @staticmethod
    async def _insert(
        conn: psycopg.AsyncConnection[tuple[object, ...]],
        case_id: UUID,
        role: Role,
        content: str,
        correlation_id: UUID,
    ) -> Message:
        cursor = conn.cursor(row_factory=class_row(Message))
        await cursor.execute(
            "INSERT INTO messages (id, case_id, role, content, correlation_id, actor)"
            " VALUES (%s, %s, %s, %s, %s, %s)"
            " RETURNING id, role, content, correlation_id, created_at",
            # Until operators write messages, each role is its own actor.
            (uuid4(), case_id, role, content, correlation_id, role),
        )
        message = await cursor.fetchone()
        assert message is not None  # noqa: S101 - INSERT ... RETURNING returns a row
        return message

    @staticmethod
    async def _set_status(
        conn: psycopg.AsyncConnection[tuple[object, ...]], case_id: UUID, status: CaseStatus
    ) -> None:
        await conn.execute(
            "UPDATE support_cases"
            " SET status = %s, updated_at = now(), last_activity_at = now() WHERE id = %s",
            (status, case_id),
        )
