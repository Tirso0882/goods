# Multi-agent, voice, and fine-tuning are in scope

The core roadmap left multi-agent systems, voice, and fine-tuning out of scope. On 7 October 2026 we brought all three in, because each is a skill an agent engineering job or a consulting client will ask about, and the store gives each one a real use. They run as three new steps after Step 12, so the case study covers them: Step 13 is a multi-agent experiment, Step 14 is voice in the storefront chat with a phone-line assessment, and Step 15 fine-tunes a small model. The old Step 13 (close gaps and publish) becomes Step 16, and the core roadmap now ends on Wednesday 23 December 2026 instead of 2 December.

Each new step is an experiment against the frozen baseline, not a commitment to ship:

- Multi-agent replaces the single agent only if the comparison report proves it is worth the cost. Roadmap rule 2 keeps that test.
- Voice is a new channel on the same agent. It ships only with zero wrong actions and read-back confirmation for every write. A phone line is assessed in writing, not built.
- Fine-tuning targets one narrow, low-risk task such as intent routing, never a task that decides a write. Policy knowledge stays in RAG, as in the Step 7 ADR.

## Consequences

- The schedule grows by three weeks. If it slips, Steps 13 to 15 shrink before anything in Steps 1 to 12 does.
- Voice adds a speech provider as a processor: it needs a DPA, a place in the data-flow diagram, and retention rules for transcripts. Raw audio is not stored by default.
- Fine-tuning needs a training set that is kept out of the eval set, and a production serving option, because the VPS has no GPU.
- Nothing in Steps 13 to 15 has been checked against primary sources yet. Run `/research` before each one.
