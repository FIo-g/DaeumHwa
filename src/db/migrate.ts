import path from 'node:path'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import type { Db } from './client'
import type * as schema from './schema'

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle')

/** Applies every SQL migration in `drizzle/` to the given database. */
export async function migrateDb(db: Db, kind: 'pglite' | 'postgres'): Promise<void> {
  if (kind === 'pglite') {
    await migratePglite(db as PgliteDatabase<typeof schema>, {
      migrationsFolder: MIGRATIONS_FOLDER,
    })
  } else {
    await migratePostgres(db as PostgresJsDatabase<typeof schema>, {
      migrationsFolder: MIGRATIONS_FOLDER,
    })
  }
}
