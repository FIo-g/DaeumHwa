import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// The query-result HKT is intentionally left open so PGlite and postgres.js share one type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>

type DriverKind = 'pglite' | 'postgres'

type GlobalWithDb = typeof globalThis & { __daeumhwaDb?: Db }

/** Postgres when DATABASE_URL is set, otherwise a local PGlite file database. */
export function getDriverKind(): DriverKind {
  return process.env.DATABASE_URL ? 'postgres' : 'pglite'
}

function createDb(): Db {
  if (getDriverKind() === 'postgres') {
    const client = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 5 })
    return drizzlePostgres(client, { schema })
  }
  // Vercel has a read-only filesystem and throws away local files, so a PGlite fallback
  // there would either crash on the first write or lose data. Fail with a clear message.
  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL 환경변수가 없습니다. Vercel(Production·Preview) 프로젝트 설정에 Postgres 연결 주소를 넣어 주세요.',
    )
  }
  const dataDir = process.env.PGLITE_DATA_DIR || '.data/pglite'
  // PGlite does not create parent directories for its data dir.
  mkdirSync(dataDir, { recursive: true })
  return drizzlePglite(new PGlite(dataDir), { schema })
}

/** Lazy singleton, memoized on globalThis so dev hot reloads reuse one connection. */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb
  if (!g.__daeumhwaDb) g.__daeumhwaDb = createDb()
  return g.__daeumhwaDb
}

/** Closes the shared connection (used by the migration CLI and scripts). */
export async function closeDb(): Promise<void> {
  const g = globalThis as GlobalWithDb
  const db = g.__daeumhwaDb
  if (!db) return
  g.__daeumhwaDb = undefined
  const client = (db as unknown as { $client: unknown }).$client
  if (getDriverKind() === 'postgres') {
    await (client as { end: () => Promise<void> }).end()
  } else {
    // Closing a PGlite instance that never finished starting up hangs, so wait for it first.
    await (client as PGlite).waitReady
    await (client as PGlite).close()
  }
}
