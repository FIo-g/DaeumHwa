// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadLocalEnv } from './load-env'
import { getDriverKind } from './client'

const KEYS = ['DATABASE_URL', 'PGLITE_DATA_DIR', 'DAEUMHWA_TEST_ONLY_KEY']

let dir: string
const saved: Record<string, string | undefined> = {}

function writeEnv(name: string, body: string) {
  fs.writeFileSync(path.join(dir, name), body)
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'))
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('loadLocalEnv', () => {
  it('loads DATABASE_URL and PGLITE_DATA_DIR from .env.local so the driver matches next dev', () => {
    writeEnv('.env.local', 'PGLITE_DATA_DIR=custom-dir\nDATABASE_URL=postgres://u@h/db\n')

    loadLocalEnv(dir)

    expect(getDriverKind()).toBe('postgres')
    expect(process.env.PGLITE_DATA_DIR).toBe('custom-dir')
  })

  it('does not override a value already set in the shell', () => {
    process.env.DATABASE_URL = 'postgres://shell/x'
    writeEnv('.env.local', 'DATABASE_URL=postgres://file/y\n')

    loadLocalEnv(dir)

    expect(process.env.DATABASE_URL).toBe('postgres://shell/x')
  })

  it('prefers .env.local over .env, and still loads keys only present in .env', () => {
    writeEnv('.env.local', 'PGLITE_DATA_DIR=from-local\n')
    writeEnv('.env', 'PGLITE_DATA_DIR=from-env\nDAEUMHWA_TEST_ONLY_KEY=only-in-env\n')

    loadLocalEnv(dir)

    expect(process.env.PGLITE_DATA_DIR).toBe('from-local')
    expect(process.env.DAEUMHWA_TEST_ONLY_KEY).toBe('only-in-env')
  })

  it('does not throw when neither file exists', () => {
    expect(() => loadLocalEnv(dir)).not.toThrow()
  })

  it('treats an empty DATABASE_URL line as unset, so the driver stays pglite', () => {
    writeEnv('.env.local', 'DATABASE_URL=\n')

    loadLocalEnv(dir)

    expect(getDriverKind()).toBe('pglite')
  })
})
