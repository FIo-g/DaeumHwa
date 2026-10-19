import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BibleSchema, RUN_BIBLE_FILE } from './bible'
import { initRun, speechFlag, twoStepFlag } from './cli'
import { loadConfig } from './state'

// Round 2 track M5 part a: --speech on for the eval CLI. Kept apart from cli.F4.test.ts.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-m5-'))
  dirs.push(dir)
  return dir
}

describe('initRun speech', () => {
  it('stores speech and writes the bible copy', () => {
    const dir = join(root(), 'haiku-speech')
    initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', dir })
    expect(loadConfig(dir).speech).toBe(true)
    const file = join(dir, RUN_BIBLE_FILE)
    expect(existsSync(file)).toBe(true)
    const copy = BibleSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    const protagonist = copy.answerBank.find((item) => item.key === 'protagonist')
    expect(protagonist?.answer).toContain('한세린 말투:')
  })

  it('writes no speech key and no copy when the flag is absent', () => {
    const dir = join(root(), 'haiku-plain')
    initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    expect(loadConfig(dir)).not.toHaveProperty('speech')
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(false)
  })

  it('allows speech on a local profile and stores it with helperThink', () => {
    const dir = join(root(), 'qwen-speech')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', speech: 'on', helperThink: 'off', dir })
    const config = loadConfig(dir)
    expect(config.speech).toBe(true)
    expect(config.helperThink).toBe('off')
  })

  it('resumes a speech run when the flag is absent and keeps the copy', () => {
    const dir = join(root(), 'haiku-resume')
    initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', dir })
    const before = readFileSync(join(dir, RUN_BIBLE_FILE), 'utf8')
    const again = initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    expect(again.dir).toBe(dir)
    expect(loadConfig(dir).speech).toBe(true)
    expect(readFileSync(join(dir, RUN_BIBLE_FILE), 'utf8')).toBe(before)
  })

  it('accepts a matching speech flag on an existing run', () => {
    const dir = join(root(), 'haiku-match')
    initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', dir })
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', dir })).not.toThrow()
  })

  it('refuses an existing run without the speech setting', () => {
    const dir = join(root(), 'haiku-plain-first')
    initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', dir })).toThrow(
      /another speech setting/,
    )
    expect(loadConfig(dir)).not.toHaveProperty('speech')
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(false)
  })

  it('rejects an unknown speech value and writes nothing', () => {
    const dir = join(root(), 'haiku-bad')
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'off', dir })).toThrow(
      'unknown speech value: off',
    )
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })
})

describe('speechFlag', () => {
  it('returns undefined when the flag is absent', () => {
    expect(speechFlag({})).toBeUndefined()
  })

  it('returns the value as given', () => {
    expect(speechFlag({ speech: 'on' })).toBe('on')
  })

  it('refuses a bare flag', () => {
    expect(() => speechFlag({ speech: true })).toThrow('unknown speech value: true')
  })
})

// Round 2 track M5 part b: --two-step on for the eval CLI.

describe('initRun twoStep', () => {
  it('stores twoStep and writes no bible copy', () => {
    const dir = join(root(), 'haiku-twostep')
    initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'on', dir })
    expect(loadConfig(dir).twoStep).toBe(true)
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(false)
  })

  it('writes no twoStep key and no copy when the flag is absent', () => {
    const dir = join(root(), 'haiku-plain')
    initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    const config = loadConfig(dir)
    expect(config).not.toHaveProperty('twoStep')
    expect(config).not.toHaveProperty('speech')
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(false)
  })

  it('stores speech and twoStep together on a cloud profile', () => {
    const dir = join(root(), 'haiku-both')
    initRun({ model: 'haiku-5.5', lang: 'ko', speech: 'on', twoStep: 'on', dir })
    const config = loadConfig(dir)
    expect(config.speech).toBe(true)
    expect(config.twoStep).toBe(true)
    expect(existsSync(join(dir, RUN_BIBLE_FILE))).toBe(true)
  })

  it('resumes a two-step run when the flag is absent', () => {
    const dir = join(root(), 'haiku-resume')
    initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'on', dir })
    const again = initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    expect(again.dir).toBe(dir)
    expect(loadConfig(dir).twoStep).toBe(true)
  })

  it('accepts a matching twoStep flag on an existing run', () => {
    const dir = join(root(), 'haiku-match')
    initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'on', dir })
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'on', dir })).not.toThrow()
  })

  it('refuses an existing run without the two-step setting', () => {
    const dir = join(root(), 'haiku-plain-then-two')
    initRun({ model: 'haiku-5.5', lang: 'ko', dir })
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'on', dir })).toThrow(
      /another two-step setting/,
    )
    expect(loadConfig(dir)).not.toHaveProperty('twoStep')
  })

  it('rejects an unknown twoStep value and writes nothing', () => {
    const dir = join(root(), 'haiku-bad')
    expect(() => initRun({ model: 'haiku-5.5', lang: 'ko', twoStep: 'yes', dir })).toThrow(
      'unknown two-step value: yes',
    )
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
  })

  it('refuses --two-step on a local profile and writes nothing', () => {
    for (const model of ['qwen3.8-27b', 'gpt-oss-20b', 'exaone3.5-32b'] as const) {
      const dir = join(root(), `${model}-two`)
      expect(() => initRun({ model, lang: 'ko', twoStep: 'on', dir })).toThrow(
        /already run the two-step draft/,
      )
      expect(existsSync(join(dir, 'config.json'))).toBe(false)
    }
  })

  it('checks the profile before the existing-run comparison', () => {
    const dir = join(root(), 'qwen-plain')
    initRun({ model: 'qwen3.8-27b', lang: 'ko', dir })
    expect(() => initRun({ model: 'qwen3.8-27b', lang: 'ko', twoStep: 'on', dir })).toThrow(
      /already run the two-step draft/,
    )
  })
})

describe('twoStepFlag', () => {
  it('returns undefined when the flag is absent', () => {
    expect(twoStepFlag({})).toBeUndefined()
  })

  it('returns the value as given', () => {
    expect(twoStepFlag({ 'two-step': 'on' })).toBe('on')
  })

  it('refuses a bare flag', () => {
    expect(() => twoStepFlag({ 'two-step': true })).toThrow('unknown two-step value: true')
  })
})
