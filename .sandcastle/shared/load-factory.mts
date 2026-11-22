// Reads the project's `.factory/factory.config.mts` and resolves it for this
// host (see factory.mts).

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import config from "../../.factory/factory.config.mts"
import { type Host, resolveFactory } from "./factory.mts"

/** The machine this runs on. Commands run only when a toolchain asks. */
const realHost = (): Host => ({
  repoRoot: join(import.meta.dirname, "../.."),
  home: homedir(),
  env: process.env,
  exists: existsSync,
  output: ([command, ...args]) =>
    execFileSync(command!, args, { encoding: "utf8" }).trim(),
})

/** This repo's settings, resolved for this host. */
export const loadFactory = () => resolveFactory(config, realHost())
