// Which of a sandbox's variables should never have reached it. Ported from
// Sandcastle's own `verify/envLeaks.ts`.

export type EnvLeak = { name: string; reason: string }

export type EnvContext = {
  /** Keys `.sandcastle/.env` declares: Sandcastle passes these on purpose. */
  declared: ReadonlySet<string>
  /** The host's secrets, name → value. */
  hostSecrets: ReadonlyMap<string, string>
  /** A random value set on the host and declared nowhere. */
  canary: string
}

/** A name that looks like it holds a secret. */
const SECRET_NAME = /TOKEN|KEY|SECRET|PASSWORD/i

/** The secret-looking variables of `env`, name → value. */
export const secretsIn = (env: NodeJS.ProcessEnv) =>
  new Map(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        SECRET_NAME.test(entry[0]) && entry[1] !== undefined
    )
  )

/**
 * The name/value pairs of a `.env` file, read the way Sandcastle reads
 * `.sandcastle/.env`: blank lines and comments skipped, quotes stripped.
 */
export const parseEnvFile = (text: string): [string, string][] =>
  text.split("\n").flatMap((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match?.[1]) return []
    const value = (match[2] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2")
    return [[match[1], value]]
  })

/** Printed before `env -0`, so output cut down to its tail shows. */
export const ENV_START = "env-start"

/** The command that prints the sandbox's environment for `parseEnvDump`. */
export const ENV_DUMP_COMMAND = `printf '${ENV_START}\\0' && env -0`

/** The sandbox's name/value pairs, or `undefined` if the dump was cut short. */
export const parseEnvDump = (
  stdout: string
): [string, string][] | undefined => {
  const [start, ...entries] = stdout.split("\0")
  if (start !== ENV_START) return undefined
  return entries
    .filter((entry) => entry.includes("="))
    .map((entry) => {
      const at = entry.indexOf("=")
      return [entry.slice(0, at), entry.slice(at + 1)]
    })
}

// A shorter value (an empty key, a port, a flag) would turn up in ordinary
// variables by chance, so it's matched by its name only.
const MIN_SECRET_LENGTH = 8

/** Every leaked variable in `env`, the sandbox's name/value pairs. */
export const classifyEnv = (
  env: readonly (readonly [string, string])[],
  ctx: EnvContext
): EnvLeak[] => {
  const leaks: EnvLeak[] = []
  for (const [name, value] of env) {
    if (ctx.canary && value.includes(ctx.canary)) {
      leaks.push({ name, reason: "carries the canary, which no .env declares" })
      continue
    }
    if (ctx.declared.has(name)) continue
    if (ctx.hostSecrets.has(name)) {
      leaks.push({ name, reason: "a host secret no .env declares" })
      continue
    }
    for (const [hostName, hostValue] of ctx.hostSecrets) {
      if (ctx.declared.has(hostName) || hostValue.length < MIN_SECRET_LENGTH)
        continue
      if (!value.includes(hostValue)) continue
      leaks.push({
        name,
        reason: `carries the value of host ${hostName}, which no .env declares`,
      })
      break
    }
  }
  return leaks
}
