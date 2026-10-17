import { loadLocalEnv } from './load-env'
import { closeDb, getDb, getDriverKind } from './client'
import { migrateDb } from './migrate'

async function main() {
  // Must run before getDb(): the DB client reads DATABASE_URL and PGLITE_DATA_DIR at call time.
  loadLocalEnv()
  await migrateDb(getDb(), getDriverKind())
  console.log('마이그레이션 완료')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
