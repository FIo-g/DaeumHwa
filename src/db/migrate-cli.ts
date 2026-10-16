import { closeDb, getDb, getDriverKind } from './client'
import { migrateDb } from './migrate'

async function main() {
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
