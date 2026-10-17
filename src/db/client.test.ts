// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from './client'

const KEYS = ['DATABASE_URL', 'PGLITE_DATA_DIR', 'VERCEL']
const saved: Record<string, string | undefined> = {}
let dir: string

beforeEach(async () => {
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-'))
  await closeDb()
})

afterEach(async () => {
  await closeDb()
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('getDb', () => {
  it('throws a clear error on Vercel when DATABASE_URL is missing', () => {
    process.env.VERCEL = '1'

    expect(() => getDb()).toThrow(/DATABASE_URL/)
  })

  it('keeps the local PGlite fallback outside Vercel', () => {
    process.env.PGLITE_DATA_DIR = path.join(dir, 'local-db')

    expect(getDb()).toBeDefined()
    expect(fs.existsSync(process.env.PGLITE_DATA_DIR)).toBe(true)
  })

  it('closes a PGlite connection that was never queried without hanging', async () => {
    process.env.PGLITE_DATA_DIR = path.join(dir, 'unused-db')
    getDb()

    await expect(closeDb()).resolves.toBeUndefined()
  }, 5000)
})
