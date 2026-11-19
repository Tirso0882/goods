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
import { useCallback, useEffect, useRef, useState } from "react"

// The support chat: a floating button on every page but checkout. The
// conversation lives in the agent's database; this keeps only what is on
// screen, and sends the server just the new message (ADR 0020).

// An error on screen. `retry` is the unanswered message a retry sends again.
type ChatError = ShownTurnError & { retry?: string }

// Cloudflare Turnstile, rendered by its own script. The chat route checks the
// token once per support case, on its first message.
type Turnstile = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string
      action: string
      callback: (token: string) => void
      "expired-callback": () => void
      "error-callback": () => void
    }
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let turnstileScript: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not load"))
    script.onerror = () => {
      turnstileScript = null
      reject(new Error("Turnstile did not load"))
    }
    document.head.appendChild(script)
  })
  return turnstileScript
}

const CHECK_FAILED: ChatError = {
  text: "The check that keeps bots out of the chat couldn't load. Reload the page to try again.",
  canRetry: false,
}

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
  // Set while the next message would open a support case: the key the
  // Turnstile check renders with. Its token goes with that message only.
  const [checkSiteKey, setCheckSiteKey] = useState<string | null>(null)
  const [checkToken, setCheckToken] = useState<string | null>(null)
  // A new value renders a fresh check: a token is good for one message.
  const [checkRound, setCheckRound] = useState(0)
  const tokenRef = useRef<string | null>(null)

  const onCheckToken = useCallback((token: string | null) => {
    tokenRef.current = token
    setCheckToken(token)
  }, [])
  const onCheckError = useCallback(() => {
    onCheckToken(null)
    setError(CHECK_FAILED)
  }, [onCheckToken])

  // The history is loaded once, the first time the chat opens.
  useEffect(() => {
    if (!enabled || loaded) return
    setLoaded(true)
    setIsLoading(true)
    fetch("/api/chat", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as {
          messages: ShownMessage[]
          turnstile_site_key?: string
        }
        setMessages(body.messages)
        setCheckSiteKey(body.turnstile_site_key || null)
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
  const runTurn = useCallback(
    async (text: string, pendingId?: string) => {
      const retry = pendingId === undefined
      setError(null)
      setIsRunning(true)
      const token = tokenRef.current
      if (token) {
        // Spent by this message, whatever comes back.
        onCheckToken(null)
        setCheckRound((round) => round + 1)
      }
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: text,
            retry,
            ...(token ? { turnstile_token: token } : {}),
          }),
        })
        const body = (await response.json().catch(() => ({}))) as {
          reply?: ShownMessage
          error?: string
          correlation_id?: string
          turnstile_site_key?: string
        }
        const reply = body.reply
        if (!response.ok || !reply) {
          const shown = describeTurnError(body.error, body.correlation_id)
          if (shown.needsCheck) {
            setCheckSiteKey(body.turnstile_site_key || null)
            setCheckRound((round) => round + 1)
          }
          if (!shown.canRetry && pendingId) {
            // The agent refused the message without storing it: take it off
            // the screen, so what is shown matches the stored conversation.
            setMessages((messages) =>
              messages.filter((m) => m.id !== pendingId)
            )
          }
          setError({ ...shown, retry: shown.canRetry ? text : undefined })
          return
        }
        setMessages((shown) => [...shown, reply])
        // The case is open: its later messages need no check.
        setCheckSiteKey(null)
      } catch {
        setError({ ...describeTurnError(undefined, undefined), retry: text })
      } finally {
        setIsRunning(false)
      }
    },
    [onCheckToken]
  )

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
    // Until the history is in, a send would be overwritten by it. A first
    // message waits for the check.
    isDisabled: isLoading || (checkSiteKey !== null && checkToken === null),
    onNew,
  })
  const check = checkSiteKey
    ? {
        siteKey: checkSiteKey,
        round: checkRound,
        onToken: onCheckToken,
        onError: onCheckError,
      }
    : null
  return { runtime, error, retry, check }
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

type Check = {
  siteKey: string
  round: number
  onToken: (token: string | null) => void
  onError: () => void
}

function TurnstileCheck({ siteKey, onToken, onError }: Omit<Check, "round">) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | undefined
    let removed = false
    loadTurnstile()
      .then((turnstile) => {
        if (removed || !container.current) return
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          action: "chat",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": onError,
        })
      })
      .catch(onError)
    return () => {
      removed = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, onToken, onError])

  return (
    <div
      className="flex flex-col gap-1 border-t border-ui-border-base px-3 py-2"
      data-testid="chat-check"
    >
      <p className="txt-compact-small text-ui-fg-subtle">
        A quick check that you are a person, before your first message.
      </p>
      <div ref={container} />
    </div>
  )
}

function ChatPanel({
  error,
  check,
  onRetry,
  onClose,
}: {
  error: ChatError | null
  check: Check | null
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

        {check && (
          <TurnstileCheck
            key={check.round}
            siteKey={check.siteKey}
            onToken={check.onToken}
            onError={check.onError}
          />
        )}

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
  const { runtime, error, retry, check } = useSupportChat(open)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {open && (
        <ChatPanel
          error={error}
          check={check}
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
