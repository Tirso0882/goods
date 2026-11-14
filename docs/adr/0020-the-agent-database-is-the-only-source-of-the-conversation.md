# The agent database is the only source of the conversation

On 14 November 2026, while planning Step 2, we decided that the agent database holds the only copy of a support case's conversation. The browser sends just the new message. The storefront server keeps the case ID in a signed httpOnly cookie, set when the first message passes Turnstile, and the agent rebuilds the history from its `messages` table on every turn.

The usual chat widget setup, including assistant-ui's default, keeps the history in the browser and sends all of it with each request. Here that would let anyone forge an agent turn or a tool result, for example a `get_order` result the agent never fetched, and the model would treat it as true. The stored transcript would also stop being the record of what was said.

The case ID is a bearer secret, because a verification grant is bound to one support case. That is why it lives in a cookie the page's scripts can't read, and never in the URL or the request body.

## Considered options

- **History held by the browser and sent with each message:** the least code and no read endpoint, but forgeable, and the audit trail and the model's view of the conversation could differ.
- **LangGraph's checkpointer as the history from Step 2:** it arrives in Step 8 for the approval pause. Until then it would be a second store with a schema we don't own, holding transcripts with a 12-month retention rule.

## Consequences

- The widget loads a case's messages through the storefront server when the page reloads, so the agent service has a read endpoint.
- Evals and replays run from stored messages, and never depend on what a browser sent.
- Losing the cookie starts a new support case, and the shopper proves the order again. Two tabs in one browser share a case.
- Step 8 has to decide how the checkpointer and the `messages` table relate. The `messages` table stays the transcript.
