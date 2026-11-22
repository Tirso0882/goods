// Reads the project's `.factory/factory.config.mts` and resolves it for this
// host (see factory.mts).

import { join } from "node:path"
import config from "../../.factory/factory.config.mts"
import { resolveFactory } from "./factory.mts"

/** This repo's settings, resolved for this host. */
export const loadFactory = () =>
  resolveFactory(config, { repoRoot: join(import.meta.dirname, "../..") })
