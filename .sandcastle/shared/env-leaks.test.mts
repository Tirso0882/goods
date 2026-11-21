import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyEnv } from "./env-leaks.mts"

const ctx = {
  declared: new Set(["CLAUDE_CODE_OAUTH_TOKEN"]),
  hostSecrets: new Map([
    ["CLAUDE_CODE_OAUTH_TOKEN", "oauth-value-123"],
    ["STRIPE_API_KEY", "stripe-value-456"],
  ]),
  canary: "canary-abc",
}

describe("classifyEnv", () => {
  it("flags the canary wherever it appears, even under a declared key", () => {
    assert.deepEqual(
      classifyEnv([["CLAUDE_CODE_OAUTH_TOKEN", "x-canary-abc-y"]], ctx),
      [
        {
          name: "CLAUDE_CODE_OAUTH_TOKEN",
          reason: "carries the canary, which no .env declares",
        },
      ]
    )
  })

  it("flags an undeclared host secret by its name", () => {
    assert.deepEqual(classifyEnv([["STRIPE_API_KEY", "anything"]], ctx), [
      { name: "STRIPE_API_KEY", reason: "a host secret no .env declares" },
    ])
  })

  it("passes a declared key and the sandbox's ordinary variables", () => {
    assert.deepEqual(
      classifyEnv(
        [
          ["CLAUDE_CODE_OAUTH_TOKEN", "oauth-value-123"],
          ["HOME", "/home/agent"],
          ["PATH", "/usr/bin"],
        ],
        ctx
      ),
      []
    )
  })

  it("flags an undeclared host secret's value copied under another name", () => {
    assert.deepEqual(classifyEnv([["OTHER", "pre-stripe-value-456"]], ctx), [
      {
        name: "OTHER",
        reason:
          "carries the value of host STRIPE_API_KEY, which no .env declares",
      },
    ])
  })

  it("doesn't match host values too short to be secrets, like an empty key or a port", () => {
    const hostSecrets = new Map([
      ["STRIPE_WEBHOOK_SECRET", ""],
      ["MEDUSA_PORT", "9000"],
    ])
    assert.deepEqual(
      classifyEnv(
        [
          ["DB_PORT", "55432"],
          ["URL", "http://localhost:9000"],
        ],
        {
          ...ctx,
          hostSecrets,
        }
      ),
      []
    )
  })
})
