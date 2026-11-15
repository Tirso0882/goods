"""The entry point for one turn: a shopper message in, the agent's reply out.

The loop is LangChain's `create_agent` (ADR 0012). The chat model is passed
in, so tests and the service can run a scripted one.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from langchain.agents import create_agent
from langchain.agents.middleware import InputAgentState
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage

from agent_core.cases import Message, Role, SupportCase, SupportCases

SYSTEM_PROMPT = (
    "You are the AI support assistant of an online jewelry store. "
    "Answer the shopper briefly, in the language they write in."
)


@dataclass(frozen=True)
class Turn:
    case_id: UUID
    reply: Message


_MODEL_MESSAGE: dict[Role, type[HumanMessage | AIMessage | SystemMessage]] = {
    "shopper": HumanMessage,
    "agent": AIMessage,
    "system": SystemMessage,
}


def to_model_messages(history: list[Message]) -> list[AnyMessage | dict[str, Any]]:
    """The stored conversation in the model's terms."""
    return [_MODEL_MESSAGE[message.role](content=message.content) for message in history]


class SupportAgent:
    def __init__(self, database_url: str, model: BaseChatModel) -> None:
        self._cases = SupportCases(database_url)
        self._graph = create_agent(model, tools=[], system_prompt=SYSTEM_PROMPT)

    async def open_case(self, message: str, correlation_id: UUID) -> Turn:
        """Opens a case with the shopper's first message and answers it."""
        case_id = await self._cases.create(correlation_id)
        return await self.take_turn(case_id, message, correlation_id)

    async def take_turn(self, case_id: UUID, message: str, correlation_id: UUID) -> Turn:
        """Answers one shopper message on an open case.

        Raises `CaseNotFoundError` for an unknown case, and `CaseNotOpenError`
        when the case is not `open`.
        """
        history = await self._cases.begin_turn(case_id, message, correlation_id)
        try:
            state: InputAgentState = {"messages": to_model_messages(history)}
            result = await self._graph.ainvoke(state)
        except BaseException:
            await self._cases.abandon_turn(case_id)
            raise
        final = result["messages"][-1]
        reply = await self._cases.finish_turn(case_id, final.text, correlation_id)
        return Turn(case_id=case_id, reply=reply)

    async def messages(self, case_id: UUID) -> list[Message]:
        """The case's conversation, oldest first."""
        return await self._cases.messages(case_id)

    async def case(self, case_id: UUID) -> SupportCase:
        return await self._cases.get(case_id)
