import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'daeumhwa'
const DB_VERSION = 1
const DRAFTS = 'drafts'
const KV = 'kv'

/** An unsaved chapter edit kept on this device until the server accepts it. */
export type LocalDraft = { title: string; body: string; savedAt: number; baseVersion: number }

let dbPromise: Promise<IDBPDatabase> | null = null

function database(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS)
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
      },
    }).catch((error: unknown) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

/** Every call degrades to `fallback` when IndexedDB is missing, blocked or throws. */
async function withDb<T>(fallback: T, run: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  try {
    return await run(await database())
  } catch {
    return fallback
  }
}

export function saveDraft(chapterId: string, draft: LocalDraft): Promise<void> {
  return withDb(undefined, async (db) => {
    await db.put(DRAFTS, draft, chapterId)
  })
}

export function getDraft(chapterId: string): Promise<LocalDraft | undefined> {
  return withDb(
    undefined,
    async (db) => (await db.get(DRAFTS, chapterId)) as LocalDraft | undefined,
  )
}

export function clearDraft(chapterId: string): Promise<void> {
  return withDb(undefined, async (db) => {
    await db.delete(DRAFTS, chapterId)
  })
}

export function getKv<T>(key: string): Promise<T | undefined> {
  return withDb(undefined, async (db) => (await db.get(KV, key)) as T | undefined)
}

export function setKv<T>(key: string, value: T): Promise<void> {
  return withDb(undefined, async (db) => {
    await db.put(KV, value, key)
  })
}
