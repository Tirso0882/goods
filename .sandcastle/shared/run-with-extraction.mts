// An agent's answer to the host, read as structured output: the work run,
// then a short run that resumes its session and asks for the answer as JSON in
// a tag. Ported from Sandcastle's own factory
// (`sandcastle/.sandcastle/agent-workflows/shared/run-with-extraction.ts`),
// which runs on top-level `run()`. Ours runs on a `Sandbox`, and 0.14's
// `box.run` takes `resumeSession` but not `output`, so the host reads the tag
// and validates it here, the way `run()` does.

import type {
  OutputObjectDefinition,
  Sandbox,
  SandboxRunOptions,
  SandboxRunResult,
} from "@ai-hero/sandcastle"
import { TicketFailure, withRetry } from "./failures.mts"

export type Answer<T> =
  | { ok: true; value: T }
  | { ok: false; problem: string; raw: string | undefined }

const lastTagContent = (text: string, tag: string) => {
  const open = `<${tag}>`
  const close = `</${tag}>`
  let content: string | undefined
  for (let from = 0; ;) {
    const start = text.indexOf(open, from)
    if (start === -1) return content
    const end = text.indexOf(close, start + open.length)
    if (end === -1) return content
    content = text.slice(start + open.length, end)
    from = end + close.length
  }
}

const unwrapFences = (text: string) =>
  /^```(?:json)?\s*\n(?<body>[\s\S]*?)\n\s*```\s*$/u
    .exec(text)
    ?.groups?.body?.trim() ?? text

/**
 * The answer in the last `<tag>` of `stdout`, checked against the schema. The
 * agent may quote the prompt's example first, so the last tag counts.
 */
export const readAnswer = async <T,>(
  stdout: string,
  output: OutputObjectDefinition<T>
): Promise<Answer<T>> => {
  const raw = lastTagContent(stdout, output.tag)
  if (raw === undefined) {
    return { ok: false, problem: `No <${output.tag}> tag.`, raw }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(unwrapFences(raw.trim()))
  } catch (error) {
    return { ok: false, problem: `Not JSON: ${String(error)}`, raw }
  }
  const result = await output.schema["~standard"].validate(parsed)
  if (result.issues) {
    const issues = result.issues.map((issue) => {
      const path = issue.path
        ?.map((key) => (typeof key === "object" ? key.key : key))
        .join(".")
      return `- ${path ? `${path}: ` : ""}${issue.message}`
    })
    return {
      ok: false,
      problem: `It doesn't match the schema:\n${issues.join("\n")}`,
      raw,
    }
  }
  return { ok: true, value: result.value }
}

const retryPrompt = (tag: string, problem: string, raw: string | undefined) =>
  `Your answer couldn't be read.

${problem}

${raw === undefined ? "" : `What you sent:\n${raw}\n\n`}Send only a corrected <${tag}> block. Don't change files or run commands.`

export interface RunWithExtractionOptions<T> extends SandboxRunOptions {
  /** Who answers, for the failure: "the reviewer". */
  readonly role: string
  readonly output: OutputObjectDefinition<T>
  /** Asks for the answer. It must show the `<tag>` the output reads. */
  readonly extractionPrompt: string
}

/** Extra tries at the answer after the first. */
const MAX_ANSWER_RETRIES = 2

/**
 * Run the agent on `box`, then ask it for its answer in the same session. An
 * answer that never validates is a `TicketFailure`: a person reads why.
 */
export const runWithExtraction = async <T,>(
  box: Pick<Sandbox, "run">,
  options: RunWithExtractionOptions<T>
): Promise<SandboxRunResult & { output: T }> => {
  const { role, output, extractionPrompt, ...workOptions } = options
  const name = workOptions.name ?? role
  const signal = workOptions.signal ?? new AbortController().signal
  const work = await withRetry(name, signal, () => box.run(workOptions))

  let session = work.iterations.at(-1)?.sessionId
  let prompt = extractionPrompt
  for (let attempt = 0; ; attempt++) {
    if (!session) {
      throw new Error(`${name} left no session to read its answer from.`)
    }
    const resumeSession = session
    const extraction = await withRetry(`${name} (answer)`, signal, () =>
      box.run({
        agent: workOptions.agent,
        name: `${name} (answer)`,
        prompt,
        // No completion signal: the resumed turn ends on its own, and a
        // closing tag the agent quotes before its answer would cut it short.
        resumeSession,
        idleTimeoutSeconds: workOptions.idleTimeoutSeconds,
        logging: workOptions.logging,
        signal,
      })
    )
    const answer = await readAnswer(extraction.stdout, output)
    if (answer.ok) return { ...work, output: answer.value }
    console.warn(`  ${name}: couldn't read its answer. ${answer.problem}`)
    if (attempt >= MAX_ANSWER_RETRIES) {
      throw new TicketFailure(`The factory couldn't read ${role}'s answer.`)
    }
    session = extraction.iterations.at(-1)?.sessionId
    prompt = retryPrompt(output.tag, answer.problem, answer.raw)
  }
}
