import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { directivesFlag, fewInstructionsFlag, initRun } from './cli'
import { loadConfig } from './state'

// --directives and --few-instructions switch tests for the eval CLI (stage 0).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh temp root; each test makes its run directories inside it. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-instr-s0-'))
  dirs.push(dir)
  return dir
}

describe('directivesFlag', () => {
  it('is undefined when the flag is absent', () => {
    expect(directivesFlag({})).toBeUndefined()
  })

  it('is true for on', () => {
    expect(directivesFlag({ directives: 'on' })).toBe(true)
  })

  it('throws on a bare flag', () => {
    expect(() => directivesFlag({ directives: true })).toThrow()
  })
})

describe('fewInstructionsFlag', () => {
  it('is undefined when the flag is absent', () => {
    expect(fewInstructionsFlag({})).toBeUndefined()
  })

  it('is true for a bare flag or on', () => {
    expect(fewInstructionsFlag({ 'few-instructions': true })).toBe(true)
    expect(fewInstructionsFlag({ 'few-instructions': 'on' })).toBe(true)
  })

  it('throws on any other value', () => {
    expect(() => fewInstructionsFlag({ 'few-instructions': 'maybe' })).toThrow()
  })
})

describe('initRun directives and fewInstructions', () => {
  it('stores directives in the config', () => {
    const dir = join(root(), 'fake-ko-directives')
    initRun({ model: 'fake', lang: 'ko', directives: true, dir })
    expect(loadConfig(dir).directives).toBe(true)
  })

  it('stores fewInstructions in the config', () => {
    const dir = join(root(), 'fake-ko-few')
    initRun({ model: 'fake', lang: 'ko', fewInstructions: true, dir })
    expect(loadConfig(dir).fewInstructions).toBe(true)
  })

  it('names the default run directory with -directives and -few', () => {
    const { dir } = initRun({ model: 'fake', lang: 'ko', directives: true, fewInstructions: true })
    dirs.push(dir)
    expect(dir.endsWith('-directives-few')).toBe(true)
  })

  it('refuses an existing directives run when the value differs', () => {
    const dir = join(root(), 'fake-ko-directives')
    initRun({ model: 'fake', lang: 'ko', directives: true, dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', directives: false, dir })).toThrow(
      /run exists with another directives/,
    )
  })

  it('refuses an existing few-instructions run when the value differs', () => {
    const dir = join(root(), 'fake-ko-few')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', fewInstructions: true, dir })).toThrow(
      /run exists with another fewInstructions/,
    )
  })
})
