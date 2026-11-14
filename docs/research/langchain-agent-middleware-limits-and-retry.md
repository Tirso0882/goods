# LangChain `create_agent` middleware: model call limit, tool call limit, tool retry

Checked on 8 November 2026 against the installed wheel source and the matching GitHub tags. Where the docs and the source disagree, the source wins and the disagreement is noted.

**Short version:**

- All three classes import from `langchain.agents.middleware`: `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware`, `ToolRetryMiddleware`. All constructor parameters are keyword-only.
- Both limit middlewares have `thread_limit` (across invocations on one checkpointer thread) and `run_limit` (one `invoke`). You must set at least one. Each count lives in a private state key. The thread count is a normal checkpointed channel. The run count is a LangGraph `UntrackedValue`, which is never checkpointed, so it starts at 0 on every invocation.
- `ModelCallLimitMiddleware.exit_behavior` is `"end"` (default) or `"error"`. `ToolCallLimitMiddleware.exit_behavior` is `"continue"` (default), `"error"` or `"end"`. `ToolCallLimitMiddleware(tool_name=...)` limits one tool. Use one instance per tool.
- To retry only read-only tools, pass `ToolRetryMiddleware(tools=[...])` with names or `BaseTool` instances, and narrow it further with `retry_on`. When retries run out, `on_failure="continue"` (default) returns an error `ToolMessage`, `"error"` re-raises, and a callable sets the message text.

## Pinned versions

| Package | Version | Released | Source used |
| --- | --- | --- | --- |
| `langchain` | 1.4.9 | 2026-11-04 | tag [`langchain==1.4.9`](https://github.com/langchain-ai/langchain/tree/d1d95b79213b0212613ae1aa4fad38bea6f1dccf) (commit `d1d95b7`) |
| `langgraph` | 1.2.20 | 2026-11-05 | tag [`1.2.20`](https://github.com/langchain-ai/langgraph/tree/a4d4187e82cdb0a73d68c76d70d655dd73a6db0b) |
| `langgraph-prebuilt` (`ToolNode`) | 1.1.1 | latest | tag [`prebuilt==1.1.1`](https://github.com/langchain-ai/langgraph/tree/5eb60aef6f3837a1fb632a8abc6cf8e8da81785b) |

Latest versions come from PyPI ([langchain](https://pypi.org/project/langchain/1.4.9/), [langgraph](https://pypi.org/project/langgraph/1.2.20/)). `langchain` 1.4.9 requires `langgraph>=1.2.12,<1.3.0` and `langchain-core>=1.7.5,<2.0.0`. I checked byte for byte that the wheel files match the GitHub tag files cited below.

Permalink prefix used below: `LC = https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/`.

## 1. Classes, imports and constructors

All three are re-exported from `langchain.agents.middleware` ([`__init__.py` L12, L27, L30](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/__init__.py#L12-L30)).

**`ModelCallLimitMiddleware`** ([model_call_limit.py L126-L164](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L126-L164)):

```python
ModelCallLimitMiddleware(*, thread_limit: int | None = None, run_limit: int | None = None,
                         exit_behavior: Literal["end", "error"] = "end")
```

It raises `ValueError` if both limits are `None` or `exit_behavior` is invalid. Its exception is `ModelCallLimitExceededError(Exception)`, defined in the same module with attributes `thread_count`, `run_count`, `thread_limit` and `run_limit` ([L63-L91](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L63-L91)).

**`ToolCallLimitMiddleware`** ([tool_call_limit.py L202-L255](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L202-L255)):

```python
ToolCallLimitMiddleware(*, tool_name: str | None = None, thread_limit: int | None = None,
                        run_limit: int | None = None,
                        exit_behavior: Literal["continue", "error", "end"] = "continue")
```

It raises `ValueError` if both limits are `None`, if `exit_behavior` is invalid, or if `run_limit > thread_limit`. Its exception is `ToolCallLimitExceededError(Exception)` in `langchain.agents.middleware.tool_call_limit`, which adds a `tool_name` attribute ([L105-L138](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L105-L138)). Neither exception is re-exported from `langchain.agents.middleware`, so import it from its module.

**`ToolRetryMiddleware`** ([tool_retry.py L133-L228](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L133-L228)):

```python
ToolRetryMiddleware(*, max_retries: int = 2, tools: list[BaseTool | str] | None = None,
                    retry_on: RetryOn = default_retry_on, on_failure: OnFailure = "continue",
                    backoff_factor: float = 2.0, initial_delay: float = 1.0,
                    max_delay: float = 60.0, jitter: bool = True)
```

The two types are `RetryOn = tuple[type[Exception], ...] | Callable[[Exception], bool]` and `OnFailure = Literal["error", "continue"] | Callable[[Exception], str]` ([_retry.py L16-L36](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/_retry.py#L16-L36)). Negative `max_retries`, delays or `backoff_factor` raise `ValueError` ([_retry.py L39-L67](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/_retry.py#L39-L67)). The delay before retry *n* (counting from 0) is `min(initial_delay * backoff_factor**n, max_delay)`, ±25% jitter, or a constant `initial_delay` when `backoff_factor == 0` ([_retry.py L98-L136](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/_retry.py#L98-L136)). The sync path uses `time.sleep` and the async path uses `asyncio.sleep` ([tool_retry.py L349, L413](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L340-L413)).

## 2. Per run versus per thread, and how counts are stored

- Both limits exist in both middlewares. `thread_limit` counts across invocations that share a `thread_id`. `run_limit` counts within one invocation ([model_call_limit.py L103-L107](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L103-L107), [tool_call_limit.py L144-L146](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L141-L146)).
- **Storage.** Model calls use `thread_model_call_count: Annotated[int, PrivateStateAttr]` and `run_model_call_count: Annotated[int, UntrackedValue, PrivateStateAttr]` ([model_call_limit.py L33-L34](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L24-L34)). Tool calls use `dict[str, int]` keyed by tool name, or `"__all__"` when no tool is named, so several instances can share the keys ([tool_call_limit.py L36-L50](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L36-L50), [L364](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L364)). `PrivateStateAttr` is `OmitFromSchema(input=True, output=True)`, which keeps these keys out of the agent's input and output schemas ([types.py L345](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/types.py#L339-L345)).
- **Reset.** `UntrackedValue` is "never checkpointed": `checkpoint()` returns `MISSING` and `from_checkpoint()` returns an empty channel ([langgraph untracked_value.py L16, L48-L54](https://github.com/langchain-ai/langgraph/blob/a4d4187e82cdb0a73d68c76d70d655dd73a6db0b/libs/langgraph/langgraph/channels/untracked_value.py#L15-L54)). So the run count starts at 0 on every invocation. The thread count is a normal channel. It persists only if you pass a checkpointer and reuse the `thread_id`. Without a checkpointer it also starts fresh each invoke. The docs mark the checkpointer as required for thread limits ([docs](https://docs.langchain.com/oss/python/langchain/middleware/built-in)). There is no reset API: start a new thread, or overwrite the private key with `update_state` (inference, not documented).
- **Inference, not tested:** because the run count lives only in memory, resuming after an `interrupt` (for example human-in-the-loop) reloads from the checkpoint and resets `run_*` counts mid-task. The docs say `run_limit` "resets with each new user message", which is looser than the source. It resets on every graph invocation, resumes included.
- **When counting happens.**
  - Model limit: `before_model` checks `count >= limit`, and `after_model` adds 1 to both counts. So `run_limit=N` allows exactly N model calls, and the (N+1)th is stopped before it runs ([model_call_limit.py L186-L251](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L186-L251)).
  - Tool limit: counting runs in `after_model`, over the `tool_calls` of the latest `AIMessage`, so a call counts when the model *requests* it, not when it finishes. A call is blocked if `count + 1 > limit`. Blocked calls add to the run count but not the thread count. With `"end"`, the thread count for that batch is rolled back ([tool_call_limit.py L269-L281, L373-L381, L457](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L269-L381)).

## 3. Retrying only read-only tools

`tools` takes names or `BaseTool` instances. Instances are reduced to `tool.name`, and every tool not in the list goes straight to `handler(request)` with no retry ([tool_retry.py L215-L241, L314-L318](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L215-L318)). `retry_on` is a tuple checked with `isinstance`, or a predicate ([_retry.py L79-L95](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/_retry.py#L79-L95)). The default `default_retry_on` retries every `Exception`, except a `langchain_core` `ModelError` whose `is_retryable` is false ([_retry.py L70-L76](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/_retry.py#L70-L76)).

```python
from langchain.agents import create_agent
from langchain.agents.middleware import (
    ModelCallLimitMiddleware, ToolCallLimitMiddleware, ToolRetryMiddleware,
)
import httpx

READ_ONLY = [get_order, search_products, get_tracking]  # BaseTool instances or names

agent = create_agent(
    model,
    tools=[*READ_ONLY, issue_refund],
    middleware=[
        ToolRetryMiddleware(
            tools=READ_ONLY,                                       # writes are never retried
            retry_on=(httpx.TimeoutException, httpx.ConnectError),  # transient errors only
            max_retries=2,
            on_failure="continue",                                 # error ToolMessage back to the model
        ),
        ToolCallLimitMiddleware(tool_name="issue_refund", run_limit=1, exit_behavior="end"),
        ModelCallLimitMiddleware(run_limit=10),
    ],
    checkpointer=checkpointer,  # needed for any thread_limit
)
```

Exceptions the retry middleware never sees or never retries:

- **Exceptions outside `retry_on`.** They re-raise immediately and skip `on_failure` ([tool_retry.py L334-L336](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L330-L336)).
- **`GraphBubbleUp`.** Interrupts and parent commands always propagate ([L326-L329](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L322-L329)).
- **Bad tool arguments.** `create_agent` builds `ToolNode` without `handle_tool_errors`, so the default `_default_handle_tool_errors` applies ([factory.py L1140-L1147](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/factory.py#L1140-L1147), [tool_node.py L761](https://github.com/langchain-ai/langgraph/blob/5eb60aef6f3837a1fb632a8abc6cf8e8da81785b/libs/prebuilt/langgraph/prebuilt/tool_node.py#L761)). It turns a bad-arguments `ToolInvocationError` into an error `ToolMessage` inside the handler, so that error is never retried. It re-raises everything else, so other errors do reach the retry loop ([tool_node.py L391-L399, L964-L1030](https://github.com/langchain-ai/langgraph/blob/5eb60aef6f3837a1fb632a8abc6cf8e8da81785b/libs/prebuilt/langgraph/prebuilt/tool_node.py#L391-L399)).
- **Tools with `handle_tool_error` set.** Such a tool swallows its own exceptions, so nothing reaches the retry loop (inference from how `BaseTool` works).

## 4. What happens when a limit is hit

**Model call limit** ([model_call_limit.py L193-L208](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L193-L208)):

- `"end"` returns `{"jump_to": "end", "messages": [AIMessage("Model call limits exceeded: run limit (10/10)")]}`. The message lists every limit that was hit, thread and/or run ([L37-L60](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py#L37-L60)).
- `"error"` raises `ModelCallLimitExceededError` with the same text.
- There is no `"continue"`.

**Tool call limit** ([tool_call_limit.py L396-L471](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L396-L471)):

- `"continue"` (default) injects a `ToolMessage(status="error")` for each blocked call. The text is `"Tool call limit exceeded. Do not call '<tool>' again."`, or `"... Do not make additional tool calls."` when the limit covers all tools ([L53-L68](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L53-L68)). Allowed calls in the same batch still run, because the router only sends calls that have no `ToolMessage` yet ([factory.py L2014-L2038](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/factory.py#L2014-L2038)). Then the model runs again and decides what to do.
- `"error"` raises `ToolCallLimitExceededError`, for example `"'search' tool call limit reached: run limit exceeded (6/5 calls)."` ([L71-L102](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L71-L102)).
- `"end"` adds:
  - the blocked-call `ToolMessage`s;
  - for every *other* pending call in the same `AIMessage`, a `ToolMessage(status="error")` saying "Execution stopped before this tool call could run because another tool call in the same batch exceeded the limit.";
  - a final `AIMessage` with the user-facing text above.

  Then it jumps to `end`. Nothing in that batch runs.
- **Single tool:** yes, via `tool_name`. The instance's `name` becomes `ToolCallLimitMiddleware[<tool>]`, which lets several instances coexist. Middleware names must be unique ([L257-L267](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_call_limit.py#L257-L267), [factory.py L1160](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/factory.py#L1160)).
- **Docs disagree:** [docs.langchain.com](https://docs.langchain.com/oss/python/langchain/middleware/built-in) still says `"end"` "only works when limiting a single tool" and raises `NotImplementedError` if other calls are pending. That was true before 1.3.15. The source no longer does it (see section 5).

**Tool retry, final failure** ([tool_retry.py L263-L293](https://github.com/langchain-ai/langchain/blob/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/tool_retry.py#L263-L293)):

- `"continue"` (default) returns `ToolMessage(status="error")` with `"Tool '<name>' failed after 3 attempts with <ExcType>: <msg>. Please try again."`.
- `"error"` re-raises the last exception.
- A callable `(exc) -> str` sets the `ToolMessage` content.
- The deprecated values `"return_message"` and `"raise"` still map to `"continue"` and `"error"`, with a `DeprecationWarning`.
- Total attempts are `max_retries + 1`.

## 5. Version notes (recent changes)

The first release containing each fix was found by comparing commits against release tags.

| First release | Change |
| --- | --- |
| 1.3.12 | `ToolRetryMiddleware` re-raises `GraphBubbleUp` (interrupts) instead of retrying them or turning them into messages ([#38722](https://github.com/langchain-ai/langchain/pull/38722)) |
| 1.3.14 | Exceptions outside `retry_on` now re-raise. Before, they went straight to `on_failure` and became a `ToolMessage` ([#38845](https://github.com/langchain-ai/langchain/pull/38845)) |
| 1.3.15 | `ToolCallLimitMiddleware` `"end"` no longer raises `NotImplementedError` when other calls are pending. It answers them with `ToolMessage`s instead ([#39258](https://github.com/langchain-ai/langchain/pull/39258)) |
| 1.3.16 | `retry_on` default changed from `(Exception,)` to `default_retry_on`, which skips non-retryable `ModelError` ([#39538](https://github.com/langchain-ai/langchain/pull/39538)) |

From 1.3.16 to 1.4.9 the constructor signatures of all three classes did not change. The only later change to `_retry.py` (#41159, for summarization) does not touch tool retry. For `ModelCallLimitMiddleware`, every commit since late 2025 has been a docstring, typing or style change ([history](https://github.com/langchain-ai/langchain/commits/d1d95b79213b0212613ae1aa4fad38bea6f1dccf/libs/langchain_v1/langchain/agents/middleware/model_call_limit.py)). In late 2025, `ToolCallLimitMiddleware` changed to count thread calls only for calls that ran (#33837, 2025-11-05).
