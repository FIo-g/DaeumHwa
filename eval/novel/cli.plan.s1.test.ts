import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initRun } from './cli'
import { loadConfig } from './state'

// Plan flags of `init` (stage 1): --quick and --draft-mode.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'novel-cli-plan-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('init plan flags', () => {
  it('stores draftMode scenes', () => {
    const { dir } = initRun({
      model: 'fake',
      lang: 'ko',
      dir: join(root, 'a'),
      draftMode: 'scenes',
    })
    expect(loadConfig(dir).draftMode).toBe('scenes')
  })

  it('refuses an unknown draft mode', () => {
    expect(() =>
      initRun({ model: 'fake', lang: 'ko', dir: join(root, 'b'), draftMode: 'x' }),
    ).toThrow('unknown draft mode: x')
  })

  it('stores quick', () => {
    const { dir } = initRun({ model: 'fake', lang: 'ko', dir: join(root, 'c'), quick: true })
    expect(loadConfig(dir).quick).toBe(true)
  })
})
