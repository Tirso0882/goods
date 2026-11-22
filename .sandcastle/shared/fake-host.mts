// A host faked as plain data, for the tests: the files that exist, what
// commands print and the environment. No real file, command or OS.

import type { Host } from "./factory.mts"

type FakeHost = {
  repoRoot?: string
  files?: readonly string[]
  outputs?: Readonly<Record<string, string>>
  env?: Readonly<Record<string, string>>
}

export const fakeHost = ({
  repoRoot = "/repo",
  files = [],
  outputs = {},
  env = {},
}: FakeHost = {}): Host => ({
  repoRoot,
  home: "/home/dev",
  env,
  exists: (path) => files.includes(path),
  output: (command) => {
    const out = outputs[command.join(" ")]
    if (out === undefined) {
      throw new Error(`The fake host can't run: ${command.join(" ")}`)
    }
    return out
  },
})
