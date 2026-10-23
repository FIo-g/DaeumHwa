import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { directivesFlag, directivesModeFlag, initRun } from './cli'
import { loadConfig } from './state'

// --directives ledger switch tests for the eval CLI (stage 2, task 8). The default run directory
// name is not built here, because that would create a run under eval/results.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-ledger-s2-'))
  dirs.push(dir)
  return dir
}

describe('--directives ledger', () => {
  it('accepts ledger as a directives value and reads it as the ledger mode', () => {
    expect(directivesFlag({ directives: 'ledger' })).toBe(true)
    expect(directivesModeFlag({ directives: 'ledger' })).toBe('ledger')
    expect(directivesModeFlag({ directives: 'on' })).toBeUndefined()
    expect(directivesModeFlag({})).toBeUndefined()
  })

  it('stores the ledger mode with directives in the config', () => {
    const dir = join(root(), 'fake-ko-ledger')
    initRun({ model: 'fake', lang: 'ko', directives: true, directivesMode: 'ledger', dir })
    const config = loadConfig(dir)
    expect(config.directives).toBe(true)
    expect(config.directivesMode).toBe('ledger')
  })

  it('names the default run directory with -ledger (source check, no run is created)', () => {
    const text = readFileSync(new URL('./cli.ts', import.meta.url), 'utf8')
    expect(text).toContain("ledger ? '-ledger' : directives ? '-directives'")
  })

  it('refuses a ledger run over an existing on run', () => {
    const dir = join(root(), 'fake-ko-on')
    initRun({ model: 'fake', lang: 'ko', directives: true, dir })
    expect(() =>
      initRun({ model: 'fake', lang: 'ko', directives: true, directivesMode: 'ledger', dir }),
    ).toThrow(/run exists with another directives/)
  })

  it('refuses an on run over an existing ledger run', () => {
    const dir = join(root(), 'fake-ko-ledger2')
    initRun({ model: 'fake', lang: 'ko', directives: true, directivesMode: 'ledger', dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', directives: true, dir })).toThrow(
      /run exists with another directives/,
    )
  })
})
