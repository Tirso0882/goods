// Goods' settings for the agent factory. Every field is optional: what isn't
// set here keeps the factory's default (see .sandcastle/shared/factory.mts).
//
//   names     labels, the base branch and the factory's branch names
//   models    the model and effort for each agent role
//   limits    parallel agents, waves, iterations, CI fix attempts
//   timeouts  per ticket, per pull request update or review, CI
//   retries   attempts and delay when the model API has trouble

import { defineFactory } from "../.sandcastle/shared/factory.mts"

export default defineFactory({
  limits: {
    // Parallel agents share one Claude subscription's rate limits.
    parallel: 3,
  },
})
