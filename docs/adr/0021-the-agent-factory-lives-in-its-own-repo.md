# The agent factory lives in its own repo

On 22 November 2026 we decided that the agent factory, which builds `ready-for-agent` issues into pull requests, leaves goods for its own repo, [Tirso0882/factory](https://github.com/Tirso0882/factory). It ships to npm as `@tirso0882/factory` and runs as a global `factory` CLI. Goods keeps only its settings in `.factory/`: the config, the compose file of test services and the coding standards. What agents need to know about goods itself stays in `AGENTS.md`.

The factory is meant for every project, not just the shop, and on Linux, macOS and Windows through WSL2. A copy in each repo would drift, and every fix would be made once per copy. Inside goods it was also wired to goods' stack: its caches, ports, checks and test folders were constants in its code.

This doesn't break ADR 0001. That ADR keeps the shop's plan, decisions and code in one repo. The factory is a tool that builds goods, not part of the shop, just as the agent skills it uses come from outside.

## Considered options

- **Keep the factory in goods and copy it into each new project:** no release process, but N forks that drift apart.
- **A package inside goods' workspace, published from there:** one copy, but its releases and issues would be mixed in with the shop's, and each fix would need a shop release.

## Consequences

- Goods declares the factory versions it accepts (`version` in `.factory/factory.config.mts`). A CLI outside the range stops and names the version to install.
- A factory fix reaches goods with the next factory release, not with a goods commit. Factory issues are tracked in Tirso0882/factory.
- The factory repo's CI can't run goods' checks. Each Sandcastle upgrade there is also checked with `factory check` on goods before it merges.
