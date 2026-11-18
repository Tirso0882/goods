"use client"

import {
  AppendMessage,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadMessageLike,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react"
import type { ShownMessage } from "@lib/chat/agent-client"
import { describeTurnError, type ShownTurnError } from "@lib/chat/turn"
import { useCallback, useEffect, useState } from "react"

// The support chat: a floating button on every page but checkout. The
// conversation lives in the agent's database; this keeps only what is on
// screen, and sends the server just the new message (ADR 0020).

// An error on screen. `retry` is the unanswered message a retry sends again.
type ChatError = ShownTurnError & { retry?: string }

const ROLE: Record<ShownMessage["role"], ThreadMessageLike["role"]> = {
  shopper: "user",
  agent: "assistant",
  system: "system",
}

const convertMessage = (message: ShownMessage): ThreadMessageLike => ({
  id: message.id,
  role: ROLE[message.role],
  content: message.content,
})

const textOf = (message: AppendMessage) =>
  message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim()

function useSupportChat(enabled: boolean) {
  const [messages, setMessages] = useState<ShownMessage[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<ChatError | null>(null)

  // The history is loaded once, the first time the chat opens.
  useEffect(() => {
    if (!enabled || loaded) return
    setLoaded(true)
    setIsLoading(true)
    fetch("/api/chat", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { messages: ShownMessage[] }
        setMessages(body.messages)
      })
      .catch(() =>
        setError({
          text: "The chat history couldn't be loaded. You can still write.",
          canRetry: false,
        })
      )
      .finally(() => setIsLoading(false))
  }, [enabled, loaded])

  // One turn. The working state shows from the send until the reply or the
  // error. A new message comes with the ID it is shown under; without one,
  // the turn is a retry of the unanswered message, which the agent answers
  // without storing it a second time.
  const runTurn = useCallback(async (text: string, pendingId?: string) => {
    const retry = pendingId === undefined
    setError(null)
    setIsRunning(true)
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, retry }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        reply?: ShownMessage
        error?: string
        correlation_id?: string
      }
      if (!response.ok || !body.reply) {
        const shown = describeTurnError(body.error, body.correlation_id)
        if (!shown.canRetry && pendingId) {
          // The agent refused the message without storing it: take it off
          // the screen, so what is shown matches the stored conversation.
          setMessages((messages) => messages.filter((m) => m.id !== pendingId))
        }
        setError({ ...shown, retry: shown.canRetry ? text : undefined })
        return
      }
      setMessages((shown) => [...shown, body.reply!])
    } catch {
      setError({ ...describeTurnError(undefined, undefined), retry: text })
    } finally {
      setIsRunning(false)
    }
  }, [])

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = textOf(message)
      if (!text) return
      const pendingId = `pending-${Date.now()}`
      setMessages((shown) => [
        ...shown,
        { id: pendingId, role: "shopper", content: text },
      ])
      await runTurn(text, pendingId)
    },
    [runTurn]
  )

  const retry = useCallback(() => {
    if (error?.retry) void runTurn(error.retry)
  }, [error, runTurn])

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage,
    isRunning,
    isLoading,
    // Until the history is in, a send would be overwritten by it.
    isDisabled: isLoading,
    onNew,
  })
  return { runtime, error, retry }
}

const UserMessage = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <div className="max-w-[85%] rounded-lg bg-ui-bg-interactive px-3 py-2 text-ui-fg-on-color whitespace-pre-wrap">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
)

const AssistantMessage = () => (
  <MessagePrimitive.Root className="flex justify-start">
    <div className="max-w-[85%] rounded-lg bg-ui-bg-subtle px-3 py-2 text-ui-fg-base whitespace-pre-wrap">
      <MessagePrimitive.Parts />
    </div>
  </MessagePrimitive.Root>
)

function ChatPanel({
  error,
  onRetry,
  onClose,
}: {
  error: ChatError | null
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <section
      aria-label="Support chat"
      className="fixed bottom-24 right-4 z-50 flex h-[32rem] max-h-[calc(100vh-8rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout"
    >
      <header className="flex items-start justify-between gap-2 border-b border-ui-border-base px-4 py-3">
        <div>
          <h2 className="txt-compact-medium-plus text-ui-fg-base">
            Support chat
          </h2>
          <p
            className="txt-compact-small text-ui-fg-subtle"
            data-testid="ai-disclosure"
          >
            You are chatting with an AI assistant, not a person. It can make
            mistakes.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the chat"
          className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base"
        >
          ✕
        </button>
      </header>

      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 txt-compact-medium">
          <ThreadPrimitive.Empty>
            <p className="text-ui-fg-subtle">
              Ask about an order and the assistant will help.
            </p>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{ UserMessage, AssistantMessage }}
          />
          <ThreadPrimitive.If running>
            <p
              className="text-ui-fg-subtle"
              role="status"
              data-testid="chat-working"
            >
              The assistant is working on a reply…
            </p>
          </ThreadPrimitive.If>
          {error && (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 text-ui-fg-error"
              data-testid="chat-error"
            >
              <p>{error.text}</p>
              {error.reference && (
                <p className="txt-compact-small">
                  Reference:{" "}
                  <span className="select-all font-mono">
                    {error.reference}
                  </span>
                </p>
              )}
              {error.retry && (
                <button
                  type="button"
                  onClick={onRetry}
                  data-testid="chat-retry"
                  className="rounded-md border border-ui-border-base px-3 py-1 txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-subtle-hover"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </ThreadPrimitive.Viewport>

        <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-ui-border-base px-3 py-2">
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            placeholder="Write a message"
            aria-label="Your message"
            className="max-h-32 flex-1 resize-none bg-transparent py-1 txt-compact-medium text-ui-fg-base outline-none"
          />
          <ComposerPrimitive.Send className="rounded-md bg-ui-button-inverted px-3 py-1 txt-compact-small-plus text-ui-fg-on-inverted disabled:opacity-50">
            Send
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </section>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const { runtime, error, retry } = useSupportChat(open)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {open && (
        <ChatPanel
          error={error}
          onRetry={retry}
          onClose={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-label={open ? "Close the support chat" : "Open the support chat"}
        data-testid="chat-button"
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ui-button-inverted text-ui-fg-on-inverted shadow-elevation-flyout"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
      </button>
    </AssistantRuntimeProvider>
  )
}
