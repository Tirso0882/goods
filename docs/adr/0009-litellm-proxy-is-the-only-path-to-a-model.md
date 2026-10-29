# The LiteLLM proxy is the only path to a model

On 29 October 2026, in the Step 1 design (#101), we decided that every model call from the agent, the eval harness and the LLM judge goes through one LiteLLM proxy, run as its own service. Nothing calls Amazon Bedrock, Ollama or any other provider directly.

The proxy holds the provider credentials (the AWS keys for Claude Sonnet in the EU inference profile), so the agent service never sees them. It records tokens and cost per call, which the cost-per-resolved-conversation metric needs, and it enforces budgets with virtual keys once it has its Postgres state (Step 2). Switching to a local model for the development loop, or to a cheaper model in Step 10, becomes a configuration change behind the same OpenAI-compatible API, not a code change.

## Rules

- No fallback model in the baseline. A second model would mix two models into one eval report. Fallbacks come back in Step 10 as a measured experiment.
- No automatic retries of anything that could write. The proxy retries model calls only; the agent's write tools never retry (`docs/design.md`).
- `LITELLM_SALT_KEY` is generated once and kept as recovery material. Rotating it makes the stored provider credentials unreadable.

## Considered options

- **The LiteLLM Python SDK inside the agent:** one fewer service, but the agent would hold the AWS keys, and the eval harness and judge would each need their own copy of the routing and budget rules.
- **Calling Bedrock directly:** the simplest start, but it ties the code to one provider and leaves cost tracking and budgets to us.

## Consequences

- One more Railway service, and one more database for its state, inside #19's backup scope.
- The proxy is on the path of every reply, so its health check joins the agent's readiness check.
