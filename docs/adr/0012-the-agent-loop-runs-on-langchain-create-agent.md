# The agent loop runs on LangChain's `create_agent` from Step 2

On 31 October 2026 we decided to build the Step 2 agent with LangChain's `create_agent`, which runs on LangGraph, instead of a hand-written loop. The roadmap had Step 2 write a plain loop and Step 8 rebuild it in LangGraph. Skipping that rebuild saves time, and the time goes to the core AI steps (evals, safe writes, RAG). ADR 0008 still holds: one agent loop, with write policy enforced in code. Only the code that runs the loop changes.

`create_agent`'s built-in middleware covers what the plain loop would have hand-rolled:

- the per-message budgets in `docs/design.md`: the model call limit and tool call limit middleware, with run limits;
- retries of read tools: the tool retry middleware, limited to the read tools;
- longer conversations in Step 7, if evals show they need it: the summarization middleware.

Because it runs on LangGraph, Step 8's Postgres checkpointer and interrupt attach to the same agent. Nothing is rebuilt.

## Considered options

- **A hand-written loop (the original plan):** every stage of the loop is visible in our own code, but Step 8 throws it away, and budgets, retries and the approval pause would each be written twice.

## Consequences

- The model is a LangChain chat model pointed at the LiteLLM proxy (ADR 0009). The agent still holds no provider credentials.
- Middleware never decides whether a write is allowed. The tools and the support routes still do (ADR 0008, ADR 0010).
- No retry middleware wraps a write tool. Writes are reconciled, never retried (`docs/design.md`).
- `langchain` and `langgraph` are pinned in `uv.lock`. Recheck the middleware docs with `/research` before Step 8.
- The Step 2 learning gate still asks for every stage of the loop and the budget that stops it. The stages are now `create_agent`'s model and tool steps, and the middleware that ends a run.
