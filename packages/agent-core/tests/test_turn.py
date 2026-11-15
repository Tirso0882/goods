"""One turn through the core: a shopper message in, the agent's reply out.

The model is scripted and the database is a throwaway one, so these run the
real loop and the real persistence with no model call.
"""

from uuid import uuid4

import psycopg
import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from agent_core import CaseNotFoundError, ScriptedChatModel, ScriptExhaustedError, SupportAgent


async def test_opening_a_case_returns_the_scripted_reply(database_url: str) -> None:
    agent = SupportAgent(database_url, ScriptedChatModel(["Hello, how can I help?"]))

    turn = await agent.open_case("Where is my order?", correlation_id=uuid4())

    assert turn.reply.role == "agent"
    assert turn.reply.content == "Hello, how can I help?"


async def test_a_turn_stores_both_messages_with_its_correlation_id(database_url: str) -> None:
    agent = SupportAgent(database_url, ScriptedChatModel(["Hello, how can I help?"]))
    correlation_id = uuid4()

    turn = await agent.open_case("Where is my order?", correlation_id=correlation_id)

    stored = await agent.messages(turn.case_id)
    assert [(m.role, m.content, m.correlation_id) for m in stored] == [
        ("shopper", "Where is my order?", correlation_id),
        ("agent", "Hello, how can I help?", correlation_id),
    ]
    assert stored[-1] == turn.reply


async def test_the_case_is_open_again_after_the_reply(database_url: str) -> None:
    agent = SupportAgent(database_url, ScriptedChatModel(["First reply", "Second reply"]))
    first = await agent.open_case("Hi", correlation_id=uuid4())

    second = await agent.take_turn(first.case_id, "Anyone there?", correlation_id=uuid4())

    assert second.reply.content == "Second reply"
    assert (await agent.case(first.case_id)).status == "open"


async def test_the_history_comes_only_from_the_database(database_url: str) -> None:
    first = await SupportAgent(database_url, ScriptedChatModel(["Original reply"])).open_case(
        "Where is my order?", correlation_id=uuid4()
    )
    # Change the stored reply behind the agent's back. The next turn, on a new
    # agent with a new model, must show the model what the database says.
    async with await psycopg.AsyncConnection.connect(database_url) as conn:
        await conn.execute(
            "UPDATE messages SET content = 'Stored reply' WHERE id = %s", (first.reply.id,)
        )
    model = ScriptedChatModel(["Second reply"])

    await SupportAgent(database_url, model).take_turn(
        first.case_id, "Order 1001", correlation_id=uuid4()
    )

    [seen] = model.calls
    assert isinstance(seen[0], SystemMessage)
    assert [(type(m), m.text) for m in seen[1:]] == [
        (HumanMessage, "Where is my order?"),
        (AIMessage, "Stored reply"),
        (HumanMessage, "Order 1001"),
    ]


async def test_a_turn_on_an_unknown_case_is_refused(database_url: str) -> None:
    agent = SupportAgent(database_url, ScriptedChatModel(["Never sent"]))

    with pytest.raises(CaseNotFoundError):
        await agent.take_turn(uuid4(), "Hello?", correlation_id=uuid4())


async def test_a_turn_that_fails_leaves_the_case_open(database_url: str) -> None:
    agent = SupportAgent(database_url, ScriptedChatModel(["Only reply"]))
    first = await agent.open_case("Hi", correlation_id=uuid4())

    with pytest.raises(ScriptExhaustedError):
        await agent.take_turn(first.case_id, "Still there?", correlation_id=uuid4())

    assert (await agent.case(first.case_id)).status == "open"
    assert [m.content for m in await agent.messages(first.case_id)][-1] == "Still there?"
