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
import { useCallback, useEffect, useState } from "react"

// The support chat: a floating button on every page but checkout. The
// conversation lives in the agent's database; this keeps only what is on
// screen, and sends the server just the new message (ADR 0020).

type ShownMessage = {
  id: string
  role: "shopper" | "agent" | "system"
  content: string
}

type ChatError = { text: string; reference?: string }

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
      .catch(() => setError({ text: "The chat history couldn't be loaded." }))
      .finally(() => setIsLoading(false))
  }, [enabled, loaded])

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = textOf(message)
    if (!text) return
    setError(null)
    setMessages((shown) => [
      ...shown,
      { id: `pending-${Date.now()}`, role: "shopper", content: text },
    ])
    setIsRunning(true)
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        reply?: ShownMessage
        error?: string
        correlation_id?: string
      }
      if (!response.ok || !body.reply) {
        setError({
          text:
            body.error === "still_answering"
              ? "Still answering your last message."
              : "Sorry, something went wrong.",
          reference: body.correlation_id,
        })
        return
      }
      setMessages((shown) => [...shown, body.reply!])
    } catch {
      setError({ text: "Sorry, the chat couldn't be reached." })
    } finally {
      setIsRunning(false)
    }
  }, [])

  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage,
    isRunning,
    isLoading,
    onNew,
  })
  return { runtime, error }
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
  onClose,
}: {
  error: ChatError | null
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
            <p className="text-ui-fg-subtle" aria-live="polite">
              The assistant is typing…
            </p>
          </ThreadPrimitive.If>
          {error && (
            <p role="alert" className="text-ui-fg-error">
              {error.text}
              {error.reference && <> Reference: {error.reference}</>}
            </p>
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
  const { runtime, error } = useSupportChat(open)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {open && <ChatPanel error={error} onClose={() => setOpen(false)} />}
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
