import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'

export async function lockWork(tx: Db, workId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workId.toLowerCase()}))`)
}
