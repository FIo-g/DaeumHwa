import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import {
  BLIND_LABEL,
  blindCallRecord,
  blindRunSummary,
  defaultBlindDir,
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

function callRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    seq: 1,
    task: 'chapter-extract',
    step: 'ch1:draft',
    kind: 'object',
    startedAt: '2026-10-19T00:00:00.000Z',
    durationMs: 5,
    firstTokenMs: null,
    speed: { outputTokensPerSec: null, promptTokensPerSec: null, source: 'wall' },
    model: 'claude-haiku-5-5',
    effortRequested: 'high',
    maxTokens: 32000,
    productTimeoutMs: 900_000,
    wouldTimeOut: false,
    system: '',
    prompt: '',
    output: null,
    usage: null,
    hangulLeft: 0,
    contextOverflow: false,
    error: null,
    ...overrides,
  }
}

describe('call record blinding', () => {
  it('sets the model label, drops profile fingerprints and keeps the rest', () => {
    const input = callRecord({
      model: 'claude-haiku-5-5',
      productTimeoutMs: 3_600_000,
      error: { kind: 'model', message: "model 'gpt-oss:20b' not found" },
    })
    const before = JSON.stringify(input)
    const blinded = blindCallRecord(input)

    expect(blinded.model).toBe(BLIND_LABEL)
    for (const key of ['effortRequested', 'maxTokens', 'productTimeoutMs', 'speed']) {
      expect(blinded).not.toHaveProperty(key)
    }
    expect(blinded.wouldTimeOut).toBe(false)
    expect(blinded.durationMs).toBe(5)
    expect(blinded.error?.kind).toBe('model')
    expect(blinded.error?.message).not.toContain('gpt-oss')
    expect(JSON.stringify(input)).toBe(before)
  })

  it('masks base Ollama tags and provider words in error messages', () => {
    const qwen = blindCallRecord(callRecord({ error: { kind: 'model', message: 'pull qwen3.8:27b failed' } }))
    expect(qwen.error?.message).not.toContain('qwen3.8')
    const ollama = blindCallRecord(
      callRecord({ error: { kind: 'model', message: 'Ollama model not found, try pulling' } }),
    )
    expect(ollama.error?.message).not.toMatch(/ollama/i)
    const opencode = blindCallRecord(callRecord({ error: { kind: 'model', message: 'OpenCode failed' } }))
    expect(opencode.error?.message).not.toMatch(/opencode/i)
  })

  it('masks brand words a model prints in its output and keeps Luna', () => {
    const output = 'I am Claude Haiku, made by Anthropic; also Qwen and EXAONE, Sonnet, Opus, gpt-oss. I am claude haiku, qwen. 루나 Luna'
    const blinded = blindCallRecord(callRecord({ output }))
    expect(blinded.output).toBe(
      `I am ${BLIND_LABEL} ${BLIND_LABEL}, made by ${BLIND_LABEL}; also ${BLIND_LABEL} and ${BLIND_LABEL}, ${BLIND_LABEL}, ${BLIND_LABEL}, ${BLIND_LABEL}. I am ${BLIND_LABEL} ${BLIND_LABEL}, ${BLIND_LABEL}. 루나 Luna`,
    )
  })
})

describe('state blinding', () => {
  it('removes speed from the run summary and masks failed messages', () => {
    const summary = blindRunSummary({
      speed: { overall: { source: 'ollama' } },
      failed: [{ message: 'qwen3.8:27b-mlx down' }],
      calls: { total: 3 },
    }) as { speed?: unknown; failed: { message: string }[]; calls: { total: number } }

    expect(summary).not.toHaveProperty('speed')
    expect(summary.failed[0]?.message).not.toContain('qwen3.8')
    expect(summary.calls.total).toBe(3)
  })

  it('defaults the blind dir next to the runs, under blind/', () => {
    expect(defaultBlindDir('eval/results/novel/2026-10-19/run-01-ko')).toBe(
      path.join('eval/results/novel/2026-10-19', 'blind', 'run-01-ko'),
    )
  })
})
