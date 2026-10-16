import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { Db } from '@/db/client'
import { migrateDb } from '@/db/migrate'
import * as schema from '@/db/schema'

/** Fresh in-memory PGlite database with every migration applied. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Db
  await migrateDb(db, 'pglite')
  return db
}
