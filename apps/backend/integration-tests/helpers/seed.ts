import path from 'path'
import { MigrationScriptsMigrator } from '@medusajs/framework/migrations'
import type { ExecArgs, MedusaContainer } from '@medusajs/framework/types'
import seedJewelry from '../../src/scripts/seed-jewelry'

/**
 * `db:migrate` runs these, the test runner does not. Core's create the default
 * shipping profile; ours create the sales channel, API key and stock location.
 */
export async function runMigrationScripts(container: MedusaContainer) {
  const migrator = new MigrationScriptsMigrator({ container })
  await migrator.ensureMigrationsTable()
  await migrator.run([
    path.join(path.dirname(require.resolve('@medusajs/medusa')), 'migration-scripts'),
    path.join(__dirname, '../../src/migration-scripts'),
  ])
}

export const seed = (container: MedusaContainer) =>
  seedJewelry({ container, args: [] } as unknown as ExecArgs)
