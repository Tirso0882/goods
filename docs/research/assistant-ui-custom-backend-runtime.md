# assistant-ui with our own FastAPI agent: which runtime, which wire format

Checked on 8 November 2026. Sources are primary: the npm registry, the assistant-ui GitHub repo at the commit tagged `@assistant-ui/react@0.15.31` (`d8124e7`, the same commit is also tagged `@assistant-ui/core@0.3.31`, `assistant-stream@0.3.54` and `@assistant-ui/react-data-stream@0.12.39`), the docs sources in that same commit (`apps/docs`, served at assistant-ui.com/docs), PyPI, and the Next.js 15 docs. Code links below point at that commit, so they stay valid. Anything I could not confirm is marked **unverified**.

**Short version:**

- Pin `@assistant-ui/react` **0.15.31** (published 22 October 2026, 17 days old). It comes with `@assistant-ui/core` 0.3.31 and `assistant-stream` 0.3.54. 0.15.32 is only 11 days old, and 0.15.33 came out today.
- Use **`LocalRuntime` with our own `ChatModelAdapter`** (`useLocalRuntime`). The Next.js route passes FastAPI's SSE bytes straight through. The client adapter parses our own events and yields assistant-ui message parts. Nothing from `ai` or `@ai-sdk/*` gets installed, and FastAPI can send whatever JSON events we choose.
- The adapter yields **cumulative** content. Each yield replaces the content of the previous one. If the adapter throws, the message ends as `incomplete` with reason `error`. An abort ends it as `incomplete` with reason `cancelled`. A run that finishes while still `running` becomes `complete` with reason `unknown`.
- **Human handoff:** put a `{ type: "data", name: "handoff", data }` part on the assistant message, and draw it with `makeAssistantDataUI({ name: "handoff", render })`. Don't use a system message for this.
- **Retry:** errors show through `MessagePrimitive.Error` and `ErrorPrimitive`, and the user retries with `ActionBarPrimitive.Reload`. The runtime has no "retrying" status of its own. When the proxy retries upstream, it sends a `retry` event. The adapter yields `metadata.custom.retry`, and the UI shows it with `AuiIf`.

## Versions (npm registry)

From `npm view <pkg> time --json` and `dependencies`:

| Package | Pin | Published | Latest today | Role |
| --- | --- | --- | --- | --- |
| `@assistant-ui/react` | **0.15.31** | 2026-10-22 | 0.15.33 (2026-11-08) | Runtime, primitives, `useLocalRuntime` |
| `@assistant-ui/core` | 0.3.31 (transitive) | 2026-10-22 | 0.3.33 | Message types, LocalRuntime core |
| `assistant-stream` | 0.3.54 (transitive) | 2026-10-22 | 0.3.56 | Stream encoders and decoders, accumulator |
| `@assistant-ui/react-markdown` | 0.14.24 (optional) | 2026-10-22 | 0.14.25 | Markdown text part; peer `@assistant-ui/react ^0.15.0` |
| `@assistant-ui/react-data-stream` | 0.12.39 (not recommended) | 2026-10-22 | 0.12.41 | `useDataStreamRuntime` |
| `@assistant-ui/react-ai-sdk` | not used | 1.4.20 on 2026-10-22 | 1.4.22 | Has peer dependency `ai ^7.0.101` |
| `@assistant-ui/react-ag-ui` | not used | 0.1.0 on 2026-10-22 | 0.1.2 | Depends on `@ag-ui/client` |
| `assistant-stream` (PyPI) | 0.0.36 | 2026-08-04 | 0.0.36 | Python encoder for the data stream and assistant transport |

What `@assistant-ui/react@0.15.31` pulls in: `zod`, `zustand`, `radix-ui`, `assistant-cloud`, `assistant-stream ^0.3.54`, `@assistant-ui/core ^0.3.31`, `@assistant-ui/store`, `@assistant-ui/tap`, `safe-content-frame` and `react-textarea-autosize`. The peer dependencies are `react`/`react-dom` `^18 || ^19`, so our React 19.0.5 fits. It does not depend on `ai` or `@ai-sdk/*`. `assistant-stream@0.3.54` lists `ai` (`^6 || ^7`), `redis` and `ioredis` as **optional** peers (`peerDependenciesMeta.optional: true`). Only its `assistant-stream/ai-sdk` subpath imports `ai` ([`frontendTools.ts`][as-aisdk]), and we would never import that subpath.

Pin it exactly (`"@assistant-ui/react": "0.15.31"`, no caret). The transitive ranges are carets (`^0.3.54`, `^0.3.31`), so without a lockfile or a `pnpm.overrides` entry a fresh install picks up newer `core` and `assistant-stream` patches. That is a real risk, because releases come every few days (0.15.10 to 0.15.33 between 8 August and 8 November).

## The candidate runtimes

The docs split custom backends into four paths ([custom/overview][doc-custom-overview], [pick-a-runtime "Lens 2"][doc-pick]):

| | LocalRuntime + `ChatModelAdapter` | ExternalStoreRuntime | DataStream (`@assistant-ui/react-data-stream`) | AssistantTransport |
| --- | --- | --- | --- | --- |
| Who owns message state | The runtime | We do (React state, zustand, ...) | The runtime (built on LocalRuntime) | Backend state snapshots (built on ExternalStore) |
| What we write | One `run` function, `async *run` for streaming | `messages`, `isRunning`, `convertMessage`, and handlers such as `onNew`, `onReload`, `onCancel` | Nothing on the client. The backend must speak the protocol | The backend streams JSON state operations. The client converts state to messages |
| Wire format FastAPI must emit | **Anything.** We parse it ourselves | Anything | assistant-stream "data stream" (`x-vercel-ai-data-stream: v1`) or AI SDK v5+ "UI message stream" | assistant-transport state ops (`set`, `append-text`) |
| `ai` / `@ai-sdk/*` installed | No | No | `@ai-sdk/provider` is a hard dependency (type-only imports) | No |
| Branching, edit, reload, cancel | Built in | Only if we add the handlers | Built in | Built in, through commands |
| HITL tools (`unstable_humanToolNames`) | Yes | Through `onAddToolResult` and similar | **No** | Through custom commands |

**LocalRuntime.** You write one `ChatModelAdapter.run`, and "the runtime handles everything else: messages, threads, branching, editing, regeneration, cancellation" ([local-runtime][doc-local]). The adapter type is `run(options) => Promise<ChatModelRunResult> | AsyncGenerator<ChatModelRunResult, void>` ([`chat-model-adapter.ts` L66-70][src-adapter]). The request and wire format are entirely ours.

**ExternalStoreRuntime.** "You provide messages and callbacks; the runtime renders whatever you give it." Each feature turns on only when you supply its handler ([external-store, handler matrix][doc-ext-handlers]). Streaming means rewriting the assistant message in our own state on every chunk ([external-store, streaming][doc-ext-stream]). It only pays off when chat state must live in our own store. We have no such store yet.

**DataStream.** `useDataStreamRuntime({ api })` wraps a ready-made `ChatModelAdapter` ([`DataStreamRuntimeAdapter.ts`][src-ds-adapter]). It accepts two wire formats: `"data-stream"`, which `createAssistantStreamResponse` from `assistant-stream` (or AI SDK v4) produces, and `"ui-message-stream"`, which AI SDK v5+ produces. Without the `x-vercel-ai-data-stream` header it falls back to the UI message stream ([data-stream, wire protocols][doc-ds]). So FastAPI, or our Next route, would have to produce one of those two Vercel-derived formats. The Python `assistant-stream` 0.0.36 package can encode the data stream format. But its `add_data` turns into a `2:` chunk ([`data_stream.py` L66][src-py-ds]), and the JS accumulator stores that in the deprecated `metadata.unstable_data`, not in a named data part ([`handleData`][src-acc-data]). The named data part chunk (`aui-data`) only exists in the JS encoder ([`DataStream.ts` L140][src-ds-aui-data]), and I found no `aui-data` in the Python encoders. The client sends the history converted by `toLanguageModelMessages` (AI SDK `LanguageModelV2Message` shapes) ([adapter][src-ds-adapter], [converter imports][src-ds-conv]). HITL tools are "not supported in the data stream runtime" ([data-stream, tool integration][doc-ds-hitl]). In short, we would take on a Vercel-shaped contract and gain little in return.

**AssistantTransport.** The backend streams snapshots of its whole agent state. Pick it "when your agent has internal state worth surfacing in the UI directly" or when you need "bidirectional commands" ([assistant-transport][doc-at]). It has a Python backend reference. It is more coupling than we need for a text chat with handoff. Worth another look if the agent later needs to show the cart or approval state live.

**Others.** There are adapters for AI SDK (needs `ai`), LangGraph, Google ADK, A2A and AG-UI ([pick-a-runtime][doc-pick]). AG-UI would only fit if the FastAPI agent were built on an AG-UI-speaking framework (for example Pydantic AI through its AG-UI adapter, which the same page lists).

**Recommendation: LocalRuntime + our own `ChatModelAdapter`.** It is the only path where (a) no Vercel package gets installed, (b) FastAPI keeps its own small SSE event set, and (c) handoff and retry signals map directly onto data parts and `metadata.custom`, with reload, cancel and error states still built in. If we later want a standard wire format, we can reuse `assistant-stream`'s `DataStreamDecoder` and `AssistantMessageAccumulator` inside our own adapter. That is exactly what the DataStream adapter does internally ([adapter L212-227][src-ds-adapter-stream]).

## Message types (pinned version)

All in [`packages/core/src/types/message.ts`][src-msg]:

- `ThreadMessage` is a system, user or assistant message. Each has `id`, `createdAt`, `role`, `content` and `metadata`, and `metadata.custom: Record<string, unknown>` is always present ([L538-633][src-msg-thread]).
  - `ThreadSystemMessage.content` is exactly one `TextMessagePart`.
  - `ThreadUserMessage` adds `attachments`.
  - `ThreadAssistantMessage` adds `status: MessageStatus` and `metadata.steps`, `timing`, `submittedFeedback` and `custom`.
- Assistant content parts (`ThreadAssistantMessagePart`, [L428-436][src-msg-parts]): `text`, `reasoning`, `tool-call`, `source`, `file`, `image`, `data`, `generative-ui`.
  - `TextMessagePart` = `{ type: "text", text, id?, status?, ... }`.
  - `DataMessagePart<T>` = `{ type: "data", name: string, data: T, id? }` ([L105-111][src-msg-data]).
- The docs call `data` the extensibility kind: "Anything that is not a modality the model consumes or a channel it emits is a `data` part, routed by `name`" ([message primitive, part types][doc-msg-parts]).
- `MessageStatus` ([L487-506][src-msg-status]) has four variants:
  - `{ type: "running" }`
  - `{ type: "requires-action", reason: "tool-calls" | "interrupt" }`
  - `{ type: "complete", reason: "stop" | "unknown" }`
  - `{ type: "incomplete", reason: "cancelled" | "tool-calls" | "length" | "content-filter" | "other" | "error", error?: ReadonlyJSONValue }`
- What the adapter returns or yields is `ChatModelRunResult` = `{ content?, status?, metadata?: { steps?, timing?, custom?, ... } }` ([L24-38][src-adapter]). `run` receives `messages` (the history), `abortSignal`, `context`, `runConfig`, and the experimental `unstable_threadId`, `unstable_getMessage` and related fields ([L50-64][src-adapter]).

## What the adapter must yield

Verified in [`local-thread-runtime-core.ts`][src-local-update] (`updateMessage`, L1428-1480, and the run loop, L1545-1592):

- **Content is cumulative.** The message content becomes the content that was there when the run started plus the content of the latest yield, so each yield replaces the previous one. The docs say the same: "Each yield replaces the previous content. Yield the full state every time, not deltas" ([local-runtime, streaming][doc-local-stream]). Since content is replaced, yielding `content: []` clears the message. We use that after an upstream retry.
- **`metadata.custom` also replaces per yield.** It is merged onto the `custom` from the start of the run, not onto the previous yield ([L1328][src-local-initcustom] and L1465-1471). A yield with no `metadata` keeps the last one. To clear a key, yield `custom` without it.
- **Status.** A yield's `status` overrides the current status. The runtime sets `running` at the start. If the generator finishes and the status is still `running`, the runtime sets `{ type: "complete", reason: "unknown" }`. On abort it sets `{ type: "incomplete", reason: "cancelled" }` ([L1545-1580][src-local-loop]). We normally never set a status ourselves.
- **Errors.** A thrown non-abort error becomes `{ type: "incomplete", reason: "error", error: toAssistantError(e) }`, and the runtime then **rethrows** it ([L1581-1590][src-local-loop]). `toAssistantError` keeps an object that already has a string `code` and `message` (and optionally `statusCode`, `severity` or `display`). Any other `Error` becomes `{ code: "unknown", message }` ([`error.ts` L87-106][src-error]). So `throw Object.assign(new Error("..."), { code: "upstream_unavailable" })` keeps our code.
- **Part status.** "A text or reasoning part reports `status.type === "running"` only while it is the last part of the message". Add a part only once it has content, never as an empty placeholder ([local-runtime, only the last part streams][doc-local-last]).
- Pass `abortSignal` to `fetch`. Swallow `AbortError` and rethrow other errors ([local-runtime, best practices][doc-local-bp]).

## Sketch: Next.js route proxying FastAPI SSE

Next.js 15 Route Handlers use the Web `Request` and `Response` and can return a `ReadableStream`. POST handlers are not cached ([Next.js 15 `route.js`][next-route]). **Sketch, not tested.** It passes FastAPI's bytes through unchanged. It retries only before the first upstream byte, and announces each retry as its own SSE event.

```ts
// apps/storefront/src/app/api/assistant/route.ts (SKETCH)
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AGENT_URL = process.env.AGENT_URL! // FastAPI, server-only
const MAX_ATTEMPTS = 3
const enc = new TextEncoder()
const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

export async function POST(req: Request) {
  const body = await req.text() // validate / attach cart + customer context here
  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let upstream: Response | undefined
        try {
          upstream = await fetch(`${AGENT_URL}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "text/event-stream" },
            body,
            signal: req.signal,
          })
        } catch {}
        if (req.signal.aborted) return out.close()
        if (upstream?.ok && upstream.body) {
          const reader = upstream.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            out.enqueue(value)
          }
          return out.close()
        }
        const retryable = !upstream || upstream.status >= 500
        if (!retryable || attempt === MAX_ATTEMPTS) {
          out.enqueue(sse("error", { code: "upstream_unavailable", message: "The assistant is unavailable." }))
          return out.close()
        }
        out.enqueue(sse("retry", { attempt: attempt + 1, max: MAX_ATTEMPTS }))
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)))
      }
    },
  })
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
  })
}
```

Our own event set, which FastAPI emits and the proxy adds `retry` to: `text {delta}`, `handoff {reason, ticketId?}`, `error {code, message}`, `done {}`. No assistant-ui or Vercel protocol is involved.

## Sketch: client adapter

**Sketch, not tested.** `readSse` stands for a small SSE line parser we would write (around 20 lines).

```tsx
"use client"
import {
  AssistantRuntimeProvider, useLocalRuntime,
  type ChatModelAdapter, type ThreadAssistantMessagePart,
} from "@assistant-ui/react"

const agentAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, unstable_threadId }) {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: unstable_threadId, messages: toAgentMessages(messages) }),
      signal: abortSignal,
    })
    if (!res.ok || !res.body)
      throw Object.assign(new Error("The assistant is unavailable."), { code: "network", statusCode: res.status })

    let text = ""
    let handoff: { reason: string; ticketId?: string } | undefined
    for await (const ev of readSse(res.body)) {
      if (ev.event === "retry") {
        text = "" // discard partial output from the failed attempt
        yield { content: [], metadata: { custom: { retry: ev.data } } }
        continue
      }
      if (ev.event === "error") throw Object.assign(new Error(ev.data.message), { code: ev.data.code })
      if (ev.event === "text") text += ev.data.delta
      if (ev.event === "handoff") handoff = ev.data
      const content: ThreadAssistantMessagePart[] = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...(handoff ? [{ type: "data" as const, name: "handoff", data: handoff }] : []),
      ]
      yield { content, metadata: { custom: handoff ? { handoff: true } : {} } } // no `retry` key clears it
    }
  },
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(agentAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
```

`toAgentMessages` is ours. It flattens text parts into `{role, content}` for FastAPI, and maps or drops the `handoff` data part. `messages` holds the history up to the user message. The docs say the in-progress assistant message "is not part of it" ([local-runtime, HITL][doc-local-hitl]).

## Human handoff in the UI

Use a named **data part** plus a registered renderer:

- `makeAssistantDataUI({ name, render })` registers a renderer for `{ type: "data", name }` parts. You mount the returned component once inside the `AssistantRuntimeProvider` tree, and it renders nothing itself ([tool-ui, data-part UI][doc-dataui], [`makeAssistantDataUI.ts`][src-make-dataui]). The docs recommend it when "the backend or orchestrator decides what to render".
- In the children API of `MessagePrimitive.Parts` / `GroupedParts`, data parts expose `part.dataRendererUI` ([message primitive, tool resolution][doc-msg-dataui]). The shipped `Thread` element already does `case "data": return part.dataRendererUI` ([`thread.aui.tsx` L721][src-thread-data]).
- The `components={{ data: { by_name } }}` prop also works, but it is **deprecated** ([message primitive][doc-msg-components]).

```tsx
// SKETCH
const HandoffUI = makeAssistantDataUI<{ reason: string }>({
  name: "handoff",
  render: ({ data }) => (
    <div role="status">You're now talking to a member of our team. We'll reply here or by email.</div>
  ),
})
// <AssistantProvider><HandoffUI /><Thread /></AssistantProvider>
```

Why not a system message: `ThreadSystemMessage` exists, but its `content` is limited to a single text part ([L538-541][src-msg-thread]). A `ChatModelAdapter` can only fill the assistant message it is running. A system message would also go back to the model in `messages` on the next turn. Whether `thread.append({ role: "system" })` gives a clean handoff banner is **unverified**.

After handoff, the composer should probably stop sending to the bot. `LocalRuntimeOptions` has no `isDisabled` ([`local-runtime-options.ts`][src-local-opts]), though `ExternalStoreRuntime` does. With LocalRuntime, hide or replace the composer with `AuiIf` ([`AuiIf.ts`][src-auiif]), for example `condition={(s) => !s.thread.messages.at(-1)?.metadata.custom.handoff}`. `s.thread.messages` is part of the thread state ([`thread.ts` L61][src-thread-state]).

## Errors, cancellation and retry in the UI

- **Error display.** `MessagePrimitive.Error` renders its children only when the message status is `incomplete` with reason `error`. `ErrorPrimitive.Message` prints `status.error` when it is a string, else `status.error.message`, else "An error occurred". `ErrorPrimitive.Root` is a `div` with `role="alert"` ([`messageErrorText`][src-err-pred], [`MessageError.ts`][src-msg-error], [`ErrorPrimitive`][src-errprim], [message primitive, error][doc-msg-error]). The shipped Thread wraps both in `MessageError` ([`thread.aui.tsx` L641][src-thread-error]).
- **Retry button.** `ActionBarPrimitive.Reload` calls `aui.message.reload()`. It is disabled when the thread is running, the thread is disabled, the message is not an assistant message, or the runtime lacks the `reload` capability ([`ActionBarReload.ts`][src-reload], [`actionBarReloadDisabled`][src-reload-pred]). It does not check the message status, so it works on errored and cancelled messages too. LocalRuntime handles "regeneration" without extra code ([local-runtime][doc-local]).
- **Cancellation.** `ComposerPrimitive.Cancel` stops the run ([`composer.ts`][src-composer]). The message settles as `incomplete` with reason `cancelled`. You can show "Stopped" with `AuiIf condition={(s) => s.message.status?.type === "incomplete" && s.message.status.reason === "cancelled"}`.
- **Running state.** `s.thread.isRunning` comes from the thread state ([`thread.ts` L51][src-thread-state]), and `s.message.status.type === "running"` from each message. Read either with `useAuiState` or `AuiIf`.
- **"Retrying…" while the proxy retries.** The runtime has no retry status. LocalRuntime never retries on its own (it just records the error, as above), and the DataStream docs say outright that "The request is not retried" ([data-stream, error handling][doc-ds-errors]). Our pattern: the proxy sends `retry {attempt, max}`. The adapter yields `content: []` with `metadata.custom.retry`. The message stays `running`. The next normal yield drops the key.

```tsx
// SKETCH, inside the assistant message
<AuiIf condition={(s) => s.message.status?.type === "running" && !!s.message.metadata.custom.retry}>
  <RetryingNotice /> {/* useAuiState((s) => s.message.metadata.custom.retry) → "Reconnecting… (2/3)" */}
</AuiIf>
<MessagePrimitive.Error>
  <ErrorPrimitive.Root>
    <ErrorPrimitive.Message />
    <ActionBarPrimitive.Reload>Try again</ActionBarPrimitive.Reload>
  </ErrorPrimitive.Root>
</MessagePrimitive.Error>
```

## Open questions and risks

- **Release churn.** Patch releases come out every few days, and transitive ranges are carets. Pin exactly, commit the lockfile, and consider `pnpm.overrides` for `@assistant-ui/core` and `assistant-stream`.
- **Experimental fields.** `unstable_threadId` and `unstable_getMessage` on `ChatModelRunOptions` are marked "Experimental since … the API may change in any release" ([`chat-model-adapter.ts` L56-63][src-adapter], [stability][doc-stability]). Wrap them in one helper. The rest of the path we rely on is not `unstable_`: `ChatModelAdapter`, `useLocalRuntime`, data parts, `metadata.custom`, `makeAssistantDataUI`, and the Error and Reload primitives. One exception: `AssistantDataUI.unstable_data`, which we don't use.
- **Rethrown errors.** LocalRuntime rethrows adapter errors after recording them. Where the rejection lands (console noise or an unhandled rejection from the composer send) is **unverified**. Check during implementation.
- **Client disconnect.** That `req.signal` in a Next.js 15.5.28 Route Handler aborts when the browser cancels, and so cancels the FastAPI call, is **unverified**. The Next.js docs page does not cover it. Test it, and have FastAPI stop work when the connection drops.
- **Mid-stream retry.** The sketch retries only before the first byte. Retrying after partial output would need idempotent agent turns (tool calls such as add-to-cart must not run twice). Decide on the FastAPI side.
- **Persistence.** LocalRuntime keeps threads in memory. A reload loses the chat unless we add a history or thread-list adapter ([adapters][doc-adapters], [threads][doc-threads]). Separate decision.
- **Styling.** The registry `Thread` element uses utilities such as `wrap-break-word`, `min-h-7.5` and `ms-2` ([`thread.aui.tsx`][src-thread-error]), which look like Tailwind v4. The storefront is on Tailwind 3.0.23. My inference, **unverified**: we will either build on the unstyled primitives or restyle the copied component.
- **Python `assistant-stream`** (0.0.36) has not had a release since 4 August 2026, while the JS side ships every few days. One more reason not to make it the contract.

[as-aisdk]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/assistant-stream/src/ai-sdk/frontendTools.ts#L1
[doc-custom-overview]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/overview.mdx#L8-L33
[doc-pick]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/pick-a-runtime.mdx#L119-L128
[doc-local]: https://www.assistant-ui.com/docs/runtimes/custom/local-runtime
[doc-local-stream]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/local-runtime.mdx#L339-L373
[doc-local-last]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/local-runtime.mdx#L375-L404
[doc-local-hitl]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/local-runtime.mdx#L541
[doc-local-bp]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/local-runtime.mdx#L760-L768
[doc-ext-handlers]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/external-store.mdx#L258-L272
[doc-ext-stream]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/external-store.mdx#L274-L311
[doc-ds]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/data-stream.mdx#L20-L35
[doc-ds-hitl]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/data-stream.mdx#L202-L205
[doc-ds-errors]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/data-stream.mdx#L304-L311
[doc-at]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/custom/assistant-transport.mdx#L15-L24
[doc-msg-parts]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/primitives/message.mdx#L115-L142
[doc-msg-dataui]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/primitives/message.mdx#L160-L176
[doc-msg-components]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/primitives/message.mdx#L178-L186
[doc-msg-error]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/primitives/message.mdx#L390-L400
[doc-dataui]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/tools/tool-ui.mdx#L1060-L1092
[doc-stability]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/concepts/stability.mdx#L8-L16
[doc-adapters]: https://www.assistant-ui.com/docs/runtimes/concepts/adapters
[doc-threads]: https://www.assistant-ui.com/docs/runtimes/concepts/threads
[src-adapter]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/runtime/utils/chat-model-adapter.ts#L19-L70
[src-msg]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/message.ts
[src-msg-data]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/message.ts#L105-L111
[src-msg-parts]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/message.ts#L428-L436
[src-msg-status]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/message.ts#L487-L506
[src-msg-thread]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/message.ts#L538-L633
[src-local-update]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/runtimes/local/local-thread-runtime-core.ts#L1428-L1480
[src-local-initcustom]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/runtimes/local/local-thread-runtime-core.ts#L1324-L1328
[src-local-loop]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/runtimes/local/local-thread-runtime-core.ts#L1545-L1592
[src-local-opts]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/runtimes/local/local-runtime-options.ts
[src-error]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/types/error.ts#L11-L106
[src-err-pred]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/store/primitive-predicates.ts#L84-L108
[src-reload-pred]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/store/primitive-predicates.ts#L41-L46
[src-msg-error]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react/src/primitives/message/MessageError.ts
[src-errprim]: https://github.com/assistant-ui/assistant-ui/tree/d8124e7b427021d977abf9aabc9a057705a81644/packages/react/src/primitives/error
[src-reload]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react/src/primitives/actionBar/ActionBarReload.ts
[src-composer]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react/src/primitives/composer.ts#L7
[src-auiif]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/store/src/AuiIf.ts
[src-thread-state]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/store/scopes/thread.ts#L51-L61
[src-make-dataui]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/core/src/react/model-context/makeAssistantDataUI.ts#L22-L37
[src-thread-data]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx#L721-L722
[src-thread-error]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx#L641-L760
[src-ds-adapter]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react-data-stream/src/DataStreamRuntimeAdapter.ts#L60-L160
[src-ds-adapter-stream]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react-data-stream/src/DataStreamRuntimeAdapter.ts#L180-L227
[src-ds-conv]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/react-data-stream/src/converters/toLanguageModelMessages.ts#L1-L8
[src-ds-aui-data]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/assistant-stream/src/core/serialization/data-stream/DataStream.ts#L140
[src-acc-data]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/packages/assistant-stream/src/core/accumulators/assistant-message-accumulator.ts#L390-L401
[src-py-ds]: https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/python/assistant-stream/src/assistant_stream/serialization/data_stream.py#L66
[next-route]: https://nextjs.org/docs/15/app/api-reference/file-conventions/route
