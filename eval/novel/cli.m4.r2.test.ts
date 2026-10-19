import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initRun, productLimitsFlag } from './cli'
import { loadConfig } from './state'

// --product-limits switch tests for the eval CLI (track M4). Kept apart from cli.F4.test.ts (spec 5).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-m4-'))
  dirs.push(dir)
  return dir
}

describe('initRun productLimits', () => {
  it('stores productLimits in the config', () => {
    const dir = join(root(), 'haiku-ko')
    initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: true, dir })
    expect(loadConfig(dir).productLimits).toBe(true)
  })

  it.each([
    ['absent', undefined],
    ['false', false],
  ])('writes no productLimits key when the option is %s', (_name, value) => {
    const dir = join(root(), 'haiku-ko')
    initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: value, dir })
    expect(loadConfig(dir)).not.toHaveProperty('productLimits')
  })

  it('resumes a product-limits run when the option is absent', () => {
    const dir = join(root(), 'haiku-ko')
    initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: true, dir })
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', dir })).not.toThrow()
    expect(loadConfig(dir).productLimits).toBe(true)
  })

  it('refuses an existing run with a different productLimits', () => {
    const plain = join(root(), 'plain')
    initRun({ model: 'haiku-5.5', lang: 'ko', dir: plain })
    expect(() =>
      initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: true, dir: plain }),
    ).toThrow(/another productLimits/)

    const limits = join(root(), 'limits')
    initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: true, dir: limits })
    expect(() =>
      initRun({ model: 'haiku-5.5', lang: 'ko', productLimits: false, dir: limits }),
    ).toThrow(/another productLimits/)
  })

  it('accepts productLimits together with helperThink', () => {
    const dir = join(root(), 'qwen-limits')
    initRun({
      model: 'qwen3.8-27b',
      lang: 'ko',
      helperThink: 'off',
      productLimits: true,
      dir,
    })
    const config = loadConfig(dir)
    expect(config.helperThink).toBe('off')
    expect(config.productLimits).toBe(true)
    expect(existsSync(join(dir, 'config.json'))).toBe(true)
  })
})

describe('productLimitsFlag', () => {
  it('returns undefined when the flag is absent', () => {
    expect(productLimitsFlag({})).toBeUndefined()
  })

  it.each([
    [true, true],
    ['on', true],
    ['off', false],
  ])('maps %s to %s', (value, expected) => {
    expect(productLimitsFlag({ 'product-limits': value as string | true })).toBe(expected)
  })

  it('throws on an unknown value', () => {
    expect(() => productLimitsFlag({ 'product-limits': 'maybe' })).toThrow(
      'unknown product-limits value: maybe',
    )
  })
})
