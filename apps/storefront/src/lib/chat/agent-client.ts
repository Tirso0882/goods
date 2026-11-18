import "server-only"

// The storefront server's client for the support agent. The agent has no
// public address: it is reached on the Compose network with a shared secret,
// and only from here.

export type ChatMessage = {
  id: string
  role: "shopper" | "agent" | "system"
  content: string
  created_at: string
}

/** A message as the browser sees it. */
export type ShownMessage = Pick<ChatMessage, "id" | "role" | "content">

export const toShownMessage = ({
  id,
  role,
  content,
}: ChatMessage): ShownMessage => ({
  id,
  role,
  content,
})

export type AgentTurn = { case_id: string; reply: ChatMessage }

/**
 * The agent answered with an error status. A failed turn names its case, so
 * a failed first message can be retried on the case that holds it.
 */
export class AgentError extends Error {
  constructor(
    readonly status: number,
    readonly caseId?: string
  ) {
    super(`agent answered ${status}`)
  }
}

async function caseOf(response: Response) {
  const body: unknown = await response.json().catch(() => null)
  return body && typeof body === "object" && "case_id" in body
    ? String(body.case_id)
    : undefined
}

// A turn is one request and one reply; the agent's own budget is 60 s.
const TURN_TIMEOUT_MS = 65_000
const READ_TIMEOUT_MS = 5_000

const agentUrl = () => process.env.AGENT_URL || "http://localhost:8080"

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; correlationId?: string },
  timeoutMs: number
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${process.env.AGENT_STOREFRONT_SECRET ?? ""}`,
  }
  if (init.correlationId) headers["x-correlation-id"] = init.correlationId
  if (init.body !== undefined) headers["content-type"] = "application/json"

  const response = await fetch(`${agentUrl()}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new AgentError(response.status, await caseOf(response))
  }
  return (await response.json()) as T
}

export const openCase = (message: string, correlationId: string) =>
  call<AgentTurn>(
    "/cases",
    { method: "POST", body: { message }, correlationId },
    TURN_TIMEOUT_MS
  )

/** One turn on an open case. `retry` sends again an unanswered message. */
export const sendMessage = (
  caseId: string,
  message: string,
  retry: boolean,
  correlationId: string
) =>
  call<AgentTurn>(
    `/cases/${encodeURIComponent(caseId)}/messages`,
    { method: "POST", body: { message, retry }, correlationId },
    TURN_TIMEOUT_MS
  )

export const readMessages = (caseId: string) =>
  call<{ case_id: string; messages: ChatMessage[] }>(
    `/cases/${encodeURIComponent(caseId)}/messages`,
    { method: "GET" },
    READ_TIMEOUT_MS
  )
