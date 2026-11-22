// The sandbox environment: what an agent's bwrap sandbox can see and reach.
//
// bwrap gives each sandbox a private, empty home directory. That hides the
// package caches, so the project's toolchains mount them back in, and it means
// nothing from the repo's `.env` is ever there: the sandbox gets only the
// variables the project declares and the tokens in `.sandcastle/.env`. Never
// copy `.env` into a worktree.
//
// What a sandbox gets comes from `.factory/factory.config.mts`, resolved in
// shared/factory.mts. Check it without spending tokens:
//   pnpm factory:check

import { execFileSync } from "node:child_process"
import type { Sandbox } from "@ai-hero/sandcastle"
import { bwrap } from "@ai-hero/sandcastle/sandboxes/bwrap"
import type { ResolvedFactory } from "./shared/factory.mts"
import { runSetupSteps } from "./shared/setup.mts"

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const compose = (factory: ResolvedFactory, ...args: string[]) => {
  if (factory.services === undefined) return
  execFileSync(
    "docker",
    ["compose", "-f", factory.services.composeFile, ...args],
    { stdio: ["ignore", "inherit", "inherit"] }
  )
}

/** Start the project's services, if it has any, and wait until they're
 *  ready. */
export const startServices = (factory: ResolvedFactory) =>
  compose(factory, "up", "--detach", "--wait")

/** Remove them, with their data. */
export const stopServices = (factory: ResolvedFactory) =>
  compose(factory, "down", "--volumes")

// ---------------------------------------------------------------------------
// The sandbox
// ---------------------------------------------------------------------------

/**
 * A bwrap sandbox with the project's mounts and its variables for `slot`.
 *
 * `slot` separates sandboxes that run at the same time: 0 for a run with no
 * parallel peer (the planner, preflight), 1 up for the parallel ones. The
 * project's `env(slot)` decides what a slot changes, such as a Redis database.
 */
export const sandbox = (factory: ResolvedFactory, slot = 0) =>
  bwrap({
    mounts: factory.sandbox.mounts,
    env: factory.sandbox.env(slot),
  })

/** Make a fresh sandbox fit for an agent: the toolchains' installs, the
 *  skill links and the project's setup steps (see shared/setup.mts). */
export const setUpSandbox = (
  factory: ResolvedFactory,
  box: Pick<Sandbox, "exec">
) => runSetupSteps(box, factory.sandbox.setup)
