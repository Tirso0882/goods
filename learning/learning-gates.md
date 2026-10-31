# Learning gates

What to learn in each step of the core roadmap, how its learning gate runs, and where its stored answer is. The roadmap's "Learning layer" section sets the rules; this file tracks them.

**Two modes, since 31 October 2026:**

- **Answer:** the agent writes a model answer to the step's learning gate and stores it in `gate-answers/`. You read it. The gate passes once the answer is stored and read.
- **Deep stop:** the core AI engineering steps (evals, eval-driven development, idempotency, RAG, synthetic data, multi-agent). The agent still writes and stores the answer, and you also explain the gate back without notes before the next step starts.

## Status

| Step | Mode | Status | Answer |
| --- | --- | --- | --- |
| Research | Explained back | Result not recorded | |
| On-ramp | Explained back | Result not recorded | |
| Setup 1 | Explained back | Passed, self-reported, no written answer | `docs/progress/week-02.md` |
| Setup 2 | Explained back | Passed; the server and worker objective was explained back later | `docs/progress/weeks-03-to-05.md` |
| Step 1: design | Answer | Read, 31 Oct 2026 | [step-01-design.md](gate-answers/step-01-design.md) |
| Step 2: thinnest agent | Answer | To do | |
| Step 3: deterministic evals | **Deep stop** | To do | |
| Step 4: LLM judge and CI | **Deep stop** | To do | |
| Step 5: prompts and injection | Answer | To do | |
| Step 6: safe write tools | **Deep stop** | To do | |
| Step 7: retrieval, events, memory | **Deep stop** | To do | |
| Step 8: durable approval | Answer | To do | |
| Step 9: synthetic conversations | **Deep stop** | To do | |
| Step 10: cost and latency | Answer | To do | |
| Step 11: guardrails | Answer | To do | |
| Step 12: reliability and operations | Answer | To do | |
| Step 13: multi-agent | **Deep stop** | To do | |
| Step 14: voice | Answer | To do | |
| Step 15: fine-tuning | Answer | To do | |
| Step 16: publish evidence | Answer, plus the walkthrough given to someone else | To do | |

## Topics by step

### Step 1: write the design before the agent

- When a single agent with tools beats a workflow, and when it doesn't.
- Authentication versus authorization for a support agent.
- Why idempotency has to be designed before the first write tool exists.
- **Gate:** walk through one return request: every state transition, tool call and check, and where a crash at each point would leave the case.

### Step 2: build the thinnest end-to-end agent

- How sampling settings and structured outputs affect tool-call reliability.
- What `pass@5` and `pass^5` each tell you, and why a support agent needs both.
- **Gate:** every stage of the agent loop and the budget that stops it, and why the tau2 retail score says nothing about the Medusa agent.

### Step 3: build deterministic evals (deep stop)

- Why final-state checks are more trustworthy than reading transcripts.
- How to tell an infrastructure failure from an agent failure, and why both are reported.
- **Gate:** design an eval case for a new intent: initial state, expected and forbidden tools, and final-state assertions.

### Step 4: calibrate the LLM judge and enforce CI (deep stop)

- How to measure judge agreement with human labels, and what level is good enough.
- Why a judge must never override a failed state or policy check.
- Setting a CI tolerance from measured flakiness instead of a guess.
- **Gate:** your judge's weakest rubric dimension and the evidence for it.

### Step 5: make prompts versioned and attack them

- Direct and indirect prompt injection, with one example of each from this store.
- The authority order between policy, store state, tool results and customer text.
- **Gate:** invent a new indirect injection through a product name or order note, then write it as a regression case.

### Step 6: add safe write tools (deep stop)

- Idempotency keys, and why a model retry is different from an HTTP retry.
- What to do with an uncertain outcome, where Medusa may have accepted the request but the agent never saw the response.
- **Gate:** walk through each of the five fault tests and explain why the design produces at most one mutation.

### Step 7: retrieval, events, and bounded memory (deep stop)

- Chunking and metadata choices for policy documents, and why exact policy terms need hybrid or filtered retrieval.
- Handling duplicate and out-of-order events.
- Why a model summary is never authoritative order state.
- **Gate:** why the agent answered one conflicting-policy case the way it did, using the retrieved sources and their effective dates.

### Step 8: durable refund approval with LangGraph

- What a checkpoint makes durable and what it does not, especially external writes.
- How `thread_id`, interrupts and resume fit together across a process restart.
- How two approve clicks are prevented from running the same refund twice (ADR 0011).
- **Gate:** the approval flow as a state diagram, where each required test would crash it, and why nothing is duplicated.

### Step 9: expand coverage with synthetic conversations (deep stop)

- How a coverage matrix decides what synthetic data to generate.
- Why synthetic judged data supplements, but never replaces, human-reviewed high-risk cases.
- **Gate:** the three weakest cells of the coverage matrix and how you filled them.

### Step 10: reduce cost and latency without losing quality

- Where the cost and latency of one conversation actually go.
- Prompt caching, model routing and admission control, and the risk each one adds.
- **Gate:** your largest saving, what it cost in risk, and the evidence that success didn't drop.

### Step 11: add guardrails as defense in depth

- Which threats guardrails own and which stay in application code, and why.
- How to measure over-blocking on valid support requests.
- **Gate:** what happens to a write request when the guardrails service is down, and why.

### Step 12: reliability, observability, and operations

- Which dashboard signals would have caught each earlier failure, and which alert fires first.
- How user feedback signals feed back into the eval dataset.
- **Gate:** three injected faults: what the system did and which signal showed it.

### Step 13: multi-agent experiment (deep stop)

- When a multi-agent design beats a single agent with tools, and what it costs in tokens, latency and lost context.
- How verified identity, idempotency keys and approvals cross an agent handoff without being restated by a model.
- Why giving each specialist only its own tools is a security property.
- **Gate:** where the multi-agent version spent its extra tokens, and which new failure mode appeared.

### Step 14: voice mode

- The cascaded voice pipeline (speech-to-text, agent, text-to-speech) and where its latency goes.
- Why a transcribed email or order number can't be trusted like typed text, and what that means for identity and writes.
- The extra privacy duties that come with audio.
- **Gate:** a voice return request, every point where a transcription error could cause a wrong action, and what stops it.

### Step 15: fine-tune a small model

- When to fine-tune instead of prompting or retrieval, and why policy knowledge stays in RAG.
- LoRA and QLoRA, and why they fit an 8 GB GPU when full fine-tuning does not.
- How training data leaks into an eval set, and how you prevented it.
- **Gate:** what the fine-tuned model learned that prompting could not give it, or why it learned nothing useful.

### Step 16: close gaps and publish evidence

- The whole system for a non-specialist in five minutes, and for an engineer in twenty.
- Defending every number in the case study from its eval report.
- **Gate:** the twenty-minute walkthrough given to someone else, answering their questions without opening the repo.
