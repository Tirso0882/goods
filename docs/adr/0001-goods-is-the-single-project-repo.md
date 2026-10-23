# `goods` is the single project repo

The roadmap says to create the project repository outside any unrelated project. We decided instead that `goods` is the one repo: the Medusa monorepo is scaffolded into it, next to `docs/research/`, the agent skills, the GitHub issues, `CONTEXT.md` and these ADRs. Keeping plan, decisions and code in one place lets the skill flow (`/to-tickets`, `/implement`) work without switching repos. Decision records go in `docs/adr/`, following `docs/agents/domain.md`, not the roadmap's `docs/decisions/`.
