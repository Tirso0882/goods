import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defineFactory,
  limitText,
  logFile,
  resolveFactory,
} from "./factory.mts"

const host = { repoRoot: "/work/goods" }

describe("resolveFactory", () => {
  it("gives an empty config today's names", () => {
    const { names } = resolveFactory(defineFactory({}), host)
    assert.deepEqual(names, {
      baseBranch: "main",
      baseRef: "origin/main",
      readyLabel: "ready-for-agent",
      humanLabel: "ready-for-human",
      prLabel: "factory",
      branchPrefix: "factory/issue-",
      plannerBranch: "factory/planner",
      preflightBranch: "factory/preflight",
      environmentCheckBranch: "factory/environment-check",
    })
  })

  it("gives an empty config today's limits", () => {
    assert.deepEqual(resolveFactory({}, host).limits, {
      parallel: 3,
      maxWaves: 10,
      implementIterations: 10,
      ciFixIterations: 5,
      maxCiFixes: 2,
      addressIterations: 5,
    })
  })

  it("gives an empty config today's timeouts", () => {
    assert.deepEqual(resolveFactory({}, host).timeouts, {
      ticketMs: 10_800_000,
      updateMs: 3_600_000,
      addressMs: 7_200_000,
      ciMs: 2_700_000,
      ciPollMs: 60_000,
      mergeabilityRecheckMs: 15_000,
    })
  })

  it("gives an empty config today's retries", () => {
    assert.deepEqual(resolveFactory({}, host).retries, {
      agentAttempts: 3,
      delayMs: 60_000,
    })
  })

  it("gives an empty config today's model and effort for each role", () => {
    const { models } = resolveFactory({}, host)
    assert.deepEqual(models, {
      planner: { model: "claude-opus-5-5", effort: "high" },
      implementer: { model: "claude-opus-5-5", effort: "medium" },
      reviewer: { model: "claude-opus-5-5", effort: "high" },
      reviewAddresser: { model: "claude-opus-5-5", effort: "high" },
      branchUpdater: { model: "claude-opus-5-5", effort: "high" },
      prWriter: { model: "claude-sonnet-5-5", effort: "medium" },
      preflight: { model: "claude-haiku-5-5", effort: "low" },
    })
  })

  it("writes the run logs under the repo's .factory/logs", () => {
    assert.equal(resolveFactory({}, host).logDir, "/work/goods/.factory/logs")
  })

  it("uses a limit the config sets and keeps the defaults beside it", () => {
    const { limits } = resolveFactory({ limits: { parallel: 1 } }, host)
    assert.equal(limits.parallel, 1)
    assert.equal(limits.maxWaves, 10)
  })

  it("derives the base ref from an overridden base branch", () => {
    const { names } = resolveFactory({ names: { baseBranch: "trunk" } }, host)
    assert.equal(names.baseRef, "origin/trunk")
  })

  it("uses a label the config sets and keeps the other labels", () => {
    const { names } = resolveFactory({ names: { prLabel: "bot" } }, host)
    assert.equal(names.prLabel, "bot")
    assert.equal(names.readyLabel, "ready-for-agent")
  })

  it("overrides one role's effort and keeps its model", () => {
    const { models } = resolveFactory(
      { models: { reviewer: { effort: "max" } } },
      host
    )
    assert.deepEqual(models.reviewer, {
      model: "claude-opus-5-5",
      effort: "max",
    })
    assert.equal(models.planner.effort, "high")
  })

  it("uses a timeout the config sets and keeps the others", () => {
    const { timeouts } = resolveFactory({ timeouts: { ciMs: 60_000 } }, host)
    assert.equal(timeouts.ciMs, 60_000)
    assert.equal(timeouts.ticketMs, 10_800_000)
  })

  it("uses retries the config sets and keeps the others", () => {
    const { retries } = resolveFactory({ retries: { agentAttempts: 1 } }, host)
    assert.deepEqual(retries, { agentAttempts: 1, delayMs: 60_000 })
  })

  it("refuses a limit that isn't a positive whole number", () => {
    for (const parallel of [0, -1, 1.5]) {
      assert.throws(
        () => resolveFactory({ limits: { parallel } }, host),
        /limits\.parallel must be a positive whole number/
      )
    }
  })

  it("refuses a timeout that isn't positive", () => {
    assert.throws(
      () => resolveFactory({ timeouts: { ticketMs: 0 } }, host),
      /timeouts\.ticketMs must be a positive number/
    )
  })
})

describe("logFile", () => {
  it("names the log after the branch and the agent", () => {
    assert.deepEqual(
      logFile("/work/goods/.factory/logs", "factory/issue-42", "reviewer #42"),
      {
        type: "file",
        path: "/work/goods/.factory/logs/factory-issue-42-reviewer--42.log",
      }
    )
  })
})

describe("limitText", () => {
  it("says whole hours in hours", () => {
    assert.equal(limitText(10_800_000), "3-hour")
  })

  it("says a limit that isn't whole hours in minutes", () => {
    assert.equal(limitText(5_400_000), "90-minute")
  })
})
