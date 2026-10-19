import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BLIND_LABEL,
  maskBrandWords,
  maskModelNames,
  maskOperationalText,
  maskProviderNames,
  modelNeedles,
} from './blind'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'novel-blind-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('model name masking', () => {
  it('removes every model id, tag and base tag, in any case', () => {
    const text =
      'qwen3.8-27b qwen3.8:27b-mlx qwen3.8:27b gpt-oss-20b gpt-oss:20b exaone3.5-32b exaone3.5:32b haiku-5.5 claude-haiku-5-5 haiku-5-5 luna-6 gpt-6-luna'
    for (const variant of [text, text.toUpperCase()]) {
      const masked = maskModelNames(variant)
      for (const needle of modelNeedles()) {
        expect(masked.toLowerCase()).not.toContain(needle.toLowerCase())
      }
    }
  })

  it('masks the longest needle first', () => {
    expect(maskModelNames('claude-haiku-5-5')).toBe(BLIND_LABEL)
  })

  it('keeps ordinary words, including Luna and 루나', () => {
    const text = 'Luna is a ship captain; fake data; 루나; Haiku poem'
    expect(maskModelNames(text)).toBe(text)
    expect(maskOperationalText('Luna 루나 haikus')).toBe('Luna 루나 haikus')
  })

  it('never includes fake, bare haiku or bare luna as needles', () => {
    const needles = modelNeedles().map((needle) => needle.toLowerCase())
    expect(needles).not.toContain('fake')
    expect(needles).not.toContain('haiku')
    expect(needles).not.toContain('luna')
  })

  it('masks the provider words ollama and opencode', () => {
    const masked = maskProviderNames('Ollama / OpenCode')
    expect(masked).not.toMatch(/ollama|opencode/i)
    expect(masked).toBe(`${BLIND_LABEL} / ${BLIND_LABEL}`)
  })

  it('masks brand words but keeps Claude v<n> citations, Luna and 루나', () => {
    const masked = maskBrandWords('I am Claude Haiku, by Anthropic. Qwen3 and EXAONE, sonnet. Claude v1.3 30.0%. Luna 루나')
    expect(masked).not.toMatch(/claude(?!\s+v\d)|anthropic|qwen|exaone|sonnet|haiku/i)
    expect(masked).toContain('Claude v1.3')
    expect(masked).toContain('Luna 루나')
  })
})
