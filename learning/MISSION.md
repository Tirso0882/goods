# Mission: Build a production-grade support agent on Medusa

## Why
Become a strong AI agent engineer by shipping a customer support agent for a Medusa store, with public evidence (evals, design doc, case study) that serves three outcomes: an agent engineering job, consulting work, and my own e-commerce business. The store is the vehicle, not the goal. The plan is the core roadmap in `../docs/research/top-1-percent-ai-agent-engineer-roadmap.md`.

## Success looks like
- Read and write the TypeScript that Medusa customization needs: modules, workflows, API routes, subscribers, scheduled jobs.
- Explain why a Medusa workflow is safer than a plain API route for a multi-step change such as a return.
- Read every step's stored learning gate answer, and explain the deep-stop gates (evals, idempotency, RAG, synthetic data, multi-agent) without notes. See `learning-gates.md`.
- Explain the core ideas of Chip Huyen's *AI Engineering* (evals, agents, RAG, prompts, inference, architecture) as they show up in this project's code.
- Run the store from the same commit-SHA images locally in Compose, with only the storefront and server public when it is hosted, and explain why a proven restore beats a backup. Nothing is hosted until the store is mature (`../docs/adr/0016-the-store-is-built-locally-until-it-is-mature.md`).
- Explain when a supervisor with specialist agents beats a single agent, and defend the choice with the Step 13 comparison report.
- Explain why the agent reaches the store through a commerce port, and what an adapter must prove to be safe.

## Constraints
- Learning block is 10:00 to 11:30 on build days, plus spaced review on Saturday (10:00 to 12:30). Lessons must fit that block.
- Core roadmap runs from 28 September 2026 to 21 January 2027 if no gate slips. Lessons follow the roadmap's step order.
- Comfortable in Python, little or no TypeScript or JavaScript. Already familiar with Docker, Compose, and GitHub Actions.
- Prefers learning solo: no communities.

## Out of scope
- Frontend depth (React, Next.js internals) beyond what the chat widget and storefront setup need.
- Voice, telephony and fine-tuning: they left the roadmap on 7 November 2026 (`../docs/adr/0015-voice-and-fine-tuning-leave-the-roadmap.md`).
- TypeScript features Medusa code does not use.
