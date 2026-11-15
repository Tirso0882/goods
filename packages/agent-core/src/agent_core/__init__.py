"""The support agent's core. It imports nothing from Medusa or the web shell."""

from agent_core.agent import SupportAgent, Turn
from agent_core.cases import (
    CaseNotFoundError,
    CaseNotOpenError,
    CaseStatus,
    Message,
    Role,
    SupportCase,
)
from agent_core.scripted_model import ScriptedChatModel, ScriptExhaustedError

__all__ = [
    "CaseNotFoundError",
    "CaseNotOpenError",
    "CaseStatus",
    "Message",
    "Role",
    "ScriptExhaustedError",
    "ScriptedChatModel",
    "SupportAgent",
    "SupportCase",
    "Turn",
]
