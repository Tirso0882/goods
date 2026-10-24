#!/usr/bin/env node
// Fails when a migration that would break a rollback hasn't been reviewed.
// A rollback runs old code on the schema the new release left behind
// (docs/runbooks/deploy-and-rollback.md), which works only while migrations
// add things. This scans the up() of every migration that `medusa db:migrate`
// runs: ours in apps/backend/src and the installed Medusa packages', so a
// Medusa upgrade is checked too. Each one that drops, renames or tightens
// something must be listed in apps/backend/migrations-reviewed.txt.
//
//   node scripts/check-migrations.mjs            # check
//   node scripts/check-migrations.mjs --accept   # record new ones as reviewed
//
// Only --accept after reading each listed migration and following the
// runbook's "Releasing a migration that breaks rollback".
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BACKEND = join(ROOT, "apps/backend")
const REVIEWED = join(BACKEND, "migrations-reviewed.txt")

// Statements old code can't survive. Adding tables, nullable columns or
// columns with a default is fine and isn't listed.
const UNSAFE = [
  ["drops a table", /\bdrop\s+table\b/i],
  ["drops a column", /\bdrop\s+column\b/i],
  ["renames a table or column", /\brename\s+(column\b|to\b)/i],
  ["changes a column type", /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i],
  ["makes a column required", /\bset\s+not\s+null\b/i],
  [
    "adds a required column without a default",
    /\badd\s+column\b(?![^;]*\bdefault\b)[^;]*\bnot\s+null\b/i,
  ],
]

function walk(dir, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== "node_modules") walk(path, found)
    else if (
      /^Migration\w*\.(ts|js)$/.test(entry.name) &&
      /[\\/]migrations$/.test(dir)
    )
      found.push(path)
  }
  return found
}

// The Medusa packages the backend actually installs, one version for all.
function medusaMigrations() {
  const store = join(ROOT, "node_modules/.pnpm")
  const version = JSON.parse(
    readFileSync(
      join(BACKEND, "node_modules/@medusajs/medusa/package.json"),
      "utf8"
    )
  ).version
  const files = []
  for (const dir of readdirSync(store)) {
    const match = dir.match(/^@medusajs\+([^@]+)@([^_]+)/)
    if (!match || match[2] !== version) continue
    const pkg = join(store, dir, "node_modules/@medusajs", match[1])
    for (const file of walk(join(pkg, "dist")))
      files.push({ file, id: `@medusajs/${match[1]}` })
  }
  return files
}

// down() undoes a migration and never runs on deploy, so only up() counts.
function upBody(source) {
  const start = source.search(/\bup\s*\(/)
  const end = source.search(/\bdown\s*\(/)
  return source.slice(start < 0 ? 0 : start, end > start ? end : undefined)
}

const migrations = [
  ...walk(join(BACKEND, "src")).map((file) => ({ file, id: "apps/backend" })),
  ...medusaMigrations(),
]
const unsafe = new Map()
for (const { file, id } of migrations) {
  const name = file
    .split(/[\\/]/)
    .pop()
    .replace(/\.(ts|js)$/, "")
  const statements = upBody(readFileSync(file, "utf8")).split(/;|addSql\(/)
  const reasons = UNSAFE.filter(([, re]) =>
    statements.some((s) => re.test(s))
  ).map(([why]) => why)
  if (reasons.length) unsafe.set(`${id} ${name}`, { file, reasons })
}

const reviewed = new Set(
  existsSync(REVIEWED)
    ? readFileSync(REVIEWED, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : []
)
const fresh = [...unsafe.keys()].filter((key) => !reviewed.has(key)).sort()

if (process.argv.includes("--accept")) {
  const header = readFileSync(REVIEWED, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("#"))
  const keys = [...new Set([...reviewed, ...fresh])].sort()
  writeFileSync(REVIEWED, [...header, ...keys, ""].join("\n"))
  console.log(`Recorded ${fresh.length} migration(s) as reviewed.`)
  process.exit(0)
}

console.log(
  `Scanned ${migrations.length} migrations, ${unsafe.size} would break a rollback past them.`
)
if (fresh.length) {
  console.error(
    `\n${fresh.length} migration(s) that break rollback are not reviewed:\n`
  )
  for (const key of fresh) {
    const { file, reasons } = unsafe.get(key)
    console.error(
      `  ${key}: ${reasons.join(", ")}\n    ${relative(ROOT, file)}`
    )
  }
  console.error(
    "\nRead each one, follow docs/runbooks/deploy-and-rollback.md#releasing-a-migration-that-breaks-rollback,",
    "\nthen run: node scripts/check-migrations.mjs --accept"
  )
  process.exit(1)
}
