import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  checkPlan,
  capParallel,
  checksPrompt,
  defineFactory,
  limitText,
  logFile,
  pnpm,
  resolveFactory,
  uv,
} from "./factory.mts"
import { fakeHost } from "./fake-host.mts"

const host = fakeHost({ repoRoot: "/work/goods" })

const pnpmHost = fakeHost({
  outputs: { "pnpm store path": "/home/dev/.local/share/pnpm/store/v10" },
  files: ["/home/dev/.cache/node/corepack"],
})

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

describe("checks and probes", () => {
  it("refuses a check without a command", () => {
    assert.throws(
      () => resolveFactory({ probes: [{ name: "x", command: " " }] }, host),
      /probes\[0\] needs a name and a command/
    )
  })

  it("refuses a check without a name", () => {
    assert.throws(
      () => resolveFactory({ checks: [{ name: "", command: "true" }] }, host),
      /checks\[0\] needs a name and a command/
    )
  })
})

describe("checksPrompt", () => {
  it("lists the configured checks for the agents, slow ones included", () => {
    const factory = resolveFactory(
      {
        checks: [
          { name: "formatting", command: "pnpm format:check" },
          { name: "tests", command: "pnpm test", slow: true },
        ],
      },
      host
    )
    assert.equal(
      checksPrompt(factory),
      "```bash\npnpm format:check  # formatting\npnpm test  # tests\n```"
    )
  })
})

describe("checkPlan", () => {
  const factory = resolveFactory(
    {
      probes: [
        { name: "deps installed", command: "test -d node_modules" },
        { name: "slow probe", command: "sleep 60", slow: true },
      ],
      checks: [
        { name: "lint", command: "pnpm lint" },
        { name: "tests", command: "pnpm test", slow: true },
      ],
    },
    host
  )
  const names = (quick: boolean) =>
    checkPlan(factory, { quick }).map((step) => step.name)

  it("runs the probes, then the checks, then the security checks", () => {
    assert.deepEqual(names(false), [
      "deps installed",
      "slow probe",
      "lint",
      "tests",
      "the home directory is private",
      "the repo's .env is not in the worktree",
      "no host secret or canary reaches the sandbox",
    ])
  })

  it("keeps the security checks when the config lists nothing", () => {
    for (const config of [{}, { checks: [], probes: [] }]) {
      const plan = checkPlan(resolveFactory(config, host), { quick: true })
      assert.deepEqual(
        plan.map((step) => step.name),
        [
          "the home directory is private",
          "the repo's .env is not in the worktree",
          "no host secret or canary reaches the sandbox",
        ]
      )
    }
  })

  it("skips what's marked slow with --quick", () => {
    assert.deepEqual(names(true), [
      "deps installed",
      "lint",
      "the home directory is private",
      "the repo's .env is not in the worktree",
      "no host secret or canary reaches the sandbox",
    ])
  })
})

describe("the pnpm() toolchain", () => {
  const { sandbox, probes } = resolveFactory({ toolchains: [pnpm()] }, pnpmHost)

  it("mounts the store writable and corepack's cache read-only", () => {
    assert.deepEqual(sandbox.mounts, [
      {
        hostPath: "/home/dev/.local/share/pnpm/store",
        sandboxPath: "/home/dev/.local/share/pnpm/store",
      },
      {
        hostPath: "/home/dev/.cache/node/corepack",
        sandboxPath: "/home/dev/.cache/node/corepack",
        readonly: true,
      },
    ])
  })

  it("points pnpm and corepack at the mounts", () => {
    assert.deepEqual(sandbox.env(1), {
      npm_config_store_dir: "/home/dev/.local/share/pnpm/store",
      COREPACK_HOME: "/home/dev/.cache/node/corepack",
    })
  })

  it("installs from the lockfile", () => {
    assert.deepEqual(sandbox.setup, [
      {
        command: "pnpm install --frozen-lockfile --prefer-offline",
        timeoutSeconds: 600,
      },
    ])
  })

  it("probes that pnpm runs and uses the mounted store", () => {
    assert.deepEqual(
      probes.map((p) => p.command),
      [
        "pnpm --version",
        'test "$(dirname "$(pnpm store path)")" = "$npm_config_store_dir"',
      ]
    )
  })

  it("uses COREPACK_HOME when the host sets it", () => {
    const { sandbox } = resolveFactory(
      { toolchains: [pnpm()] },
      fakeHost({
        outputs: { "pnpm store path": "/store/v10" },
        files: ["/opt/corepack"],
        env: { COREPACK_HOME: "/opt/corepack" },
      })
    )
    assert.equal(sandbox.env(0)["COREPACK_HOME"], "/opt/corepack")
  })

  it("leaves corepack out when the host has no corepack cache", () => {
    const { sandbox } = resolveFactory(
      { toolchains: [pnpm()] },
      fakeHost({ outputs: { "pnpm store path": "/store/v10" } })
    )
    assert.deepEqual(sandbox.mounts, [
      { hostPath: "/store", sandboxPath: "/store" },
    ])
    assert.deepEqual(sandbox.env(0), { npm_config_store_dir: "/store" })
  })
})

describe("the uv() toolchain", () => {
  const { sandbox, probes } = resolveFactory(
    { toolchains: [uv()] },
    fakeHost({
      outputs: {
        "uv cache dir": "/home/dev/.cache/uv",
        "uv python dir": "/home/dev/.local/share/uv/python",
      },
    })
  )

  it("mounts uv's cache and its Pythons writable", () => {
    assert.deepEqual(sandbox.mounts, [
      { hostPath: "/home/dev/.cache/uv", sandboxPath: "/home/dev/.cache/uv" },
      {
        hostPath: "/home/dev/.local/share/uv/python",
        sandboxPath: "/home/dev/.local/share/uv/python",
      },
    ])
  })

  it("points uv at the mounts", () => {
    assert.deepEqual(sandbox.env(1), {
      UV_CACHE_DIR: "/home/dev/.cache/uv",
      UV_PYTHON_INSTALL_DIR: "/home/dev/.local/share/uv/python",
    })
  })

  it("syncs from the lockfile", () => {
    assert.deepEqual(sandbox.setup, [
      { command: "uv sync --locked", timeoutSeconds: 600 },
    ])
  })

  it("probes that uv uses the mounted cache", () => {
    assert.deepEqual(
      probes.map((p) => p.command),
      ['test "$(uv cache dir)" = "$UV_CACHE_DIR"']
    )
  })
})

describe("the sandbox a config declares", () => {
  const bothHost = fakeHost({
    outputs: {
      "pnpm store path": "/store/v10",
      "uv cache dir": "/uv-cache",
      "uv python dir": "/uv-python",
    },
  })
  const factory = resolveFactory(
    {
      toolchains: [pnpm(), uv()],
      mounts: [
        { hostPath: "/data/fixtures", readonly: true },
        { hostPath: "/opt/tool", sandboxPath: "/tool" },
      ],
      env: (slot) => ({ REDIS_URL: `redis://localhost:6379/${slot}` }),
      setup: [{ command: 'chmod 700 "$HOME"' }],
      probes: [{ name: "deps", command: "test -d node_modules" }],
      maxSlots: 15,
    },
    bothHost
  )

  it("runs the toolchains' setup first, in order, then the project's", () => {
    assert.deepEqual(
      factory.sandbox.setup.map((step) => step.command),
      [
        "pnpm install --frozen-lockfile --prefer-offline",
        "uv sync --locked",
        'chmod 700 "$HOME"',
      ]
    )
  })

  it("mounts the toolchains' paths, then the project's", () => {
    assert.deepEqual(factory.sandbox.mounts, [
      { hostPath: "/store", sandboxPath: "/store" },
      { hostPath: "/uv-cache", sandboxPath: "/uv-cache" },
      { hostPath: "/uv-python", sandboxPath: "/uv-python" },
      {
        hostPath: "/data/fixtures",
        sandboxPath: "/data/fixtures",
        readonly: true,
      },
      { hostPath: "/opt/tool", sandboxPath: "/tool" },
    ])
  })

  it("lists the toolchains' probes before the project's", () => {
    assert.deepEqual(
      factory.probes.map((p) => p.name),
      [
        "pnpm runs from the mounted corepack cache",
        "pnpm uses the mounted store",
        "uv uses the mounted cache",
        "deps",
      ]
    )
  })

  it("gives each slot the project's variables for it beside the caches'", () => {
    assert.deepEqual(factory.sandbox.env(3), {
      npm_config_store_dir: "/store",
      UV_CACHE_DIR: "/uv-cache",
      UV_PYTHON_INSTALL_DIR: "/uv-python",
      REDIS_URL: "redis://localhost:6379/3",
    })
    assert.equal(
      factory.sandbox.env(0)["REDIS_URL"],
      "redis://localhost:6379/0"
    )
  })

  it("refuses a slot past maxSlots, or one that isn't a slot", () => {
    for (const slot of [16, -1, 1.5]) {
      assert.throws(
        () => factory.sandbox.env(slot),
        /Sandbox slot must be 0 to 15/
      )
    }
  })

  it("gives a config with no sandbox declarations an empty sandbox", () => {
    const { sandbox } = resolveFactory({}, host)
    assert.deepEqual(sandbox.mounts, [])
    assert.deepEqual(sandbox.setup, [])
    assert.deepEqual(sandbox.env(7), {})
  })
})

describe("the slot cap", () => {
  it("caps the configured parallel limit at maxSlots", () => {
    const factory = resolveFactory(
      { limits: { parallel: 20 }, maxSlots: 15 },
      host
    )
    assert.equal(factory.limits.parallel, 15)
    assert.equal(factory.maxSlots, 15)
  })

  it("keeps a parallel limit under maxSlots", () => {
    const factory = resolveFactory(
      { limits: { parallel: 3 }, maxSlots: 15 },
      host
    )
    assert.equal(factory.limits.parallel, 3)
  })

  it("caps a parallel count asked for on the command line", () => {
    const factory = resolveFactory({ maxSlots: 15 }, host)
    assert.equal(capParallel(factory, 40), 15)
    assert.equal(capParallel(factory, 2), 2)
  })

  it("has no cap when the project sets no maxSlots", () => {
    const factory = resolveFactory({ limits: { parallel: 40 } }, host)
    assert.equal(factory.limits.parallel, 40)
    assert.equal(factory.maxSlots, undefined)
    assert.equal(capParallel(factory, 100), 100)
    assert.deepEqual(factory.sandbox.env(100), {})
  })

  it("refuses a maxSlots that isn't a positive whole number", () => {
    assert.throws(
      () => resolveFactory({ maxSlots: 0 }, host),
      /maxSlots must be a positive whole number/
    )
  })
})

describe("services", () => {
  it("resolves the compose file inside .factory", () => {
    const { services } = resolveFactory({ services: "compose.yaml" }, host)
    assert.deepEqual(services, {
      composeFile: "/work/goods/.factory/compose.yaml",
    })
  })

  it("has none when the project declares none", () => {
    assert.equal(resolveFactory({}, host).services, undefined)
  })
})

describe("the private home", () => {
  it("refuses a mount of the real home or a directory above it", () => {
    for (const hostPath of ["/home/dev", "/home/dev/", "/home", "/"]) {
      assert.throws(
        () => resolveFactory({ mounts: [{ hostPath }] }, host),
        /would show the sandbox your home directory/
      )
    }
  })

  it("refuses a mount of the home's credentials", () => {
    for (const hostPath of [
      "/home/dev/.ssh",
      "/home/dev/.config/gh",
      "/home/dev/.claude",
      "/home/dev/.config",
    ]) {
      assert.throws(
        () => resolveFactory({ mounts: [{ hostPath }] }, host),
        /would show the sandbox your credentials/
      )
    }
  })

  it("allows a mount inside the home", () => {
    const { sandbox } = resolveFactory(
      { mounts: [{ hostPath: "/home/dev/.cache/tool" }] },
      host
    )
    assert.equal(sandbox.mounts[0]?.hostPath, "/home/dev/.cache/tool")
  })

  it("refuses a variable that would move the sandbox's home", () => {
    const factory = resolveFactory({ env: () => ({ HOME: "/home/dev" }) }, host)
    assert.throws(() => factory.sandbox.env(1), /env can't set HOME/)
  })

  it("refuses a variable that would repoint a toolchain's cache", () => {
    const factory = resolveFactory(
      {
        toolchains: [pnpm()],
        env: () => ({ npm_config_store_dir: "/elsewhere" }),
      },
      pnpmHost
    )
    assert.throws(
      () => factory.sandbox.env(1),
      /env can't set npm_config_store_dir: the pnpm toolchain sets it/
    )
  })
})
