import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { helperThinkFlag, initRun } from './cli'
import { loadConfig } from './state'

// Helper think switch tests for the eval CLI (track F4). Kept apart from cli.E2.test.ts (spec 5).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-f4-'))
  dirs.push(dir)
  return dir
}

describe('initRun helperThink', () => {
  it('stores helperThink in the config', () => {
    const dir = join(root(), 'qwen-off')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', helperThink: 'off', dir })
    expect(loadConfig(dir).helperThink).toBe('off')
  })

  it('writes no helperThink key when the flag is absent', () => {
    const dir = join(root(), 'qwen-plain')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    expect(loadConfig(dir)).not.toHaveProperty('helperThink')
  })

  it('resumes a helper run when the flag is absent', () => {
    const dir = join(root(), 'qwen-resume')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', helperThink: 'off', dir })
    const again = initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    expect(again.dir).toBe(dir)
    expect(loadConfig(dir).helperThink).toBe('off')
  })

  it('refuses an existing run with a different helperThink', () => {
    const gptDir = join(root(), 'gpt-low')
    initRun({ model: 'gpt-oss-20b', lang: 'ko', helperThink: 'low', dir: gptDir })
    expect(() =>
      initRun({ model: 'gpt-oss-20b', lang: 'ko', helperThink: 'medium', dir: gptDir }),
    ).toThrow(/another helperThink/)

    // A run's setting cannot change after it was created, including from unset to set.
    const qwenDir = join(root(), 'qwen-plain')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir: qwenDir })
    expect(() =>
      initRun({ model: 'qwen3.8-27b', lang: 'ko', helperThink: 'off', dir: qwenDir }),
    ).toThrow(/another helperThink/)
  })

  it('rejects an unknown helper think value', () => {
    const dir = join(root(), 'qwen-bad')
    expect(() => initRun({ model: 'qwen3.8-27b', lang: 'ko', helperThink: 'max', dir })).toThrow(
      'unknown helper think: max',
    )
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })

  it('checks helperThink before the existing-run comparison', () => {
    const dir = join(root(), 'qwen-then-low')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    let message = ''
    try {
      initRun({ model: 'qwen3.8-27b', lang: 'ko', helperThink: 'low', dir })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/use --helper-think off/)
    expect(message).not.toMatch(/another helperThink/)
  })

  it('rejects helperThink on a profile it cannot affect', () => {
    const cases: [string, string][] = [
      ['haiku-5.5', 'off'],
      ['fake', 'off'],
      ['gpt-oss-20b', 'off'],
      ['qwen3.8-27b', 'low'],
      ['exaone3.5-32b', 'off'],
    ]
    for (const [model, helperThink] of cases) {
      const dir = join(root(), `${model}-${helperThink}`)
      expect(() => initRun({ model, lang: 'ko', helperThink, dir })).toThrow()
      expect(existsSync(join(dir, 'config.json'))).toBe(false)
    }
  })

  it('reads an old config.json without helperThink', () => {
    const dir = join(root(), 'old-config')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    expect(loadConfig(dir).helperThink).toBeUndefined()
  })
})

describe('helperThinkFlag', () => {
  it('rejects a bare --helper-think', () => {
    expect(() => helperThinkFlag({ 'helper-think': true })).toThrow('unknown helper think: true')
  })

  it('returns undefined when the flag is absent and the value when given', () => {
    expect(helperThinkFlag({})).toBeUndefined()
    expect(helperThinkFlag({ 'helper-think': 'off' })).toBe('off')
  })
})
