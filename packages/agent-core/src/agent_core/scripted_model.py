"""A chat model that replies from a script: free, repeatable, no network.

Tests use it to drive the real agent loop, and the service uses it until the
LiteLLM proxy is wired in. With `record`, it keeps what it was shown, so a
test can check exactly which conversation reached the model. The service
leaves it off: a long-lived model would hold every conversation in memory.
"""

from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel, LanguageModelInput
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from pydantic import Field, PrivateAttr


class ScriptExhaustedError(RuntimeError):
    """The model was called more times than its script has replies."""


class ScriptedChatModel(BaseChatModel):
    """Replies with the next scripted reply on each call.

    With `repeat`, the last reply is given again once the script runs out,
    instead of failing.
    """

    replies: list[str]
    repeat: bool = False
    record: bool = False
    # Every call's input, oldest first, when `record` is on.
    calls: list[list[BaseMessage]] = Field(default_factory=list)
    _next: int = PrivateAttr(default=0)

    def __init__(
        self, replies: list[str], *, repeat: bool = False, record: bool = False, **kwargs: Any
    ) -> None:
        super().__init__(replies=replies, repeat=repeat, record=record, **kwargs)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        if self.record:
            self.calls.append(list(messages))
        if self._next >= len(self.replies):
            if not (self.repeat and self.replies):
                raise ScriptExhaustedError(f"no reply scripted for call {self._next + 1}")
            reply = self.replies[-1]
        else:
            reply = self.replies[self._next]
        self._next += 1
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=reply))])

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Callable[..., Any] | BaseTool],
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable[LanguageModelInput, AIMessage]:
        # The script decides what is said, so the tools change nothing.
        return self
