# Project configuration

Fields marked `BLOCKED` are undecided. Do not perform steps that depend on them.

```text
Repository path: goods (see docs/adr/0001-goods-is-the-single-project-repo.md)
Product category: Jewelry, without watches, imported from China; supplier not chosen yet; storefront reference: https://bamoer.com/ (see docs/adr/0002-product-category-is-jewelry.md)
Repository visibility: Private (until secret scanning, the license, and publication review are complete)
Laptop operating system: macOS 26.7 (arm64), zsh
Docker runtime: Docker Desktop, engine 29.8.2
GPU confirmed by nvidia-smi: No (Apple Silicon, no NVIDIA GPU)
Node version: 24 LTS (v24.21.0), pinned in .nvmrc, switched automatically by fnm 1.39.0
Package manager and version: BLOCKED (npm 11.19.0 ships with Node 24; confirm what create-medusa-app uses in Setup 1)
Python version: 3.12 (3.12.13 via uv), pinned in .python-version
Hosted model provider: Amazon Bedrock, eu-central-1, through LiteLLM
Primary model: Claude Sonnet (EU cross-region inference profile)
Embedding model: BLOCKED
Monthly model budget: BLOCKED
EU VPS provider and region: BLOCKED
Domain: BLOCKED
Object storage provider: BLOCKED
Transactional email provider: BLOCKED
Data retention period for conversations: BLOCKED
Remote: https://github.com/Tirso0882/goods (private), default branch main
Default branch protection enabled: No (GitHub Free does not support branch protection or rulesets on private repos; changes reach main through PRs by convention)
```
