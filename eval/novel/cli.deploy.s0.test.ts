import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deploySettingsFlag, initRun } from './cli'
import { loadConfig } from './state'

// --deploy-settings switch tests for the eval CLI (stage 0). Kept apart from cli.m4.r2.test.ts.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-s0-'))
  dirs.push(dir)
  return dir
}

describe('initRun deploySettings', () => {
  it('stores deploySettings and productLimits in the config', () => {
    const dir = join(root(), 'haiku-ko-deploy')
    initRun({ model: 'fake', lang: 'ko', deploySettings: true, dir })
    const config = loadConfig(dir)
    expect(config.deploySettings).toBe(true)
    expect(config.productLimits).toBe(true)
  })

  it('names the default run directory with -deploy', () => {
    const { dir } = initRun({ model: 'fake', lang: 'ko', deploySettings: true })
    dirs.push(dir)
    expect(dir.endsWith('-deploy')).toBe(true)
  })

  it('keeps -deploy last in the default run directory name', () => {
    const { dir } = initRun({ model: 'fake', lang: 'ko', deploySettings: true, speech: 'on' })
    dirs.push(dir)
    expect(dir.endsWith('-deploy')).toBe(true)
  })

  it('refuses deploy settings together with helperThink', () => {
    const dir = join(root(), 'haiku-ko-deploy')
    expect(() =>
      initRun({ model: 'haiku-5.5', lang: 'ko', deploySettings: true, helperThink: 'low', dir }),
    ).toThrow('--deploy-settings cannot be combined with --helper-think')
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })

  it('refuses an existing deploy run when the flag is left out', () => {
    const dir = join(root(), 'haiku-ko-deploy')
    initRun({ model: 'fake', lang: 'ko', deploySettings: true, dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', dir })).toThrow(
      /run exists with another deploySettings/,
    )
  })
})

describe('deploySettingsFlag', () => {
  it('is undefined when the flag is absent', () => {
    expect(deploySettingsFlag({})).toBeUndefined()
  })

  it('is true for a bare flag or on', () => {
    expect(deploySettingsFlag({ 'deploy-settings': true })).toBe(true)
    expect(deploySettingsFlag({ 'deploy-settings': 'on' })).toBe(true)
  })

  it('is false for off', () => {
    expect(deploySettingsFlag({ 'deploy-settings': 'off' })).toBe(false)
  })

  it('throws on any other value', () => {
    expect(() => deploySettingsFlag({ 'deploy-settings': 'maybe' })).toThrow()
  })
})
