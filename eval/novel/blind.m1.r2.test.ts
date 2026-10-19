import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import type { PowerInfo } from './power'
import { blindCallRecord, blindRunSummary, writeBlindCopy } from './blind'

// Power is a local-run fingerprint, so the reviewer's copy must not carry it (track M1).
// Copies the helpers of blind.test.ts.

const LOW: PowerInfo = { source: 'ac', mode: 'low', modeRaw: 'powermode 1' }

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'novel-blind-m1-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
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
    model: 'qwen3.8:27b-mlx',
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

function put(root: string, rel: string, content: string): void {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

describe('power blinding', () => {
  it('blindCallRecord drops power', () => {
    const input = callRecord({ power: LOW })
    const before = JSON.stringify(input)
    const blinded = blindCallRecord(input)
    expect(blinded).not.toHaveProperty('power')
    expect(blinded.seq).toBe(1)
    expect(blinded.task).toBe('chapter-extract')
    expect(JSON.stringify(input)).toBe(before)
  })

  it('blindRunSummary drops power and keeps calls', () => {
    const summary = {
      calls: { total: 1 },
      power: { sampled: 1, lowPower: 1, onBattery: 0, byMode: { low: 1 }, bySource: { ac: 1 } },
    }
    const blinded = blindRunSummary(summary) as Record<string, unknown>
    expect(blinded).not.toHaveProperty('power')
    expect(blinded.calls).toEqual({ total: 1 })
  })

  it('the blinded copy carries no power', () => {
    const runDir = path.join(tempDir(), '2026-10-19', 'run-01-ko')
    put(
      runDir,
      'config.json',
      JSON.stringify({
        runId: 'run-01',
        modelId: 'qwen3.8-27b',
        lang: 'ko',
        chapters: 1,
        questions: 1,
        maxDraftAttempts: 3,
        createdAt: '2026-10-19T00:00:00.000Z',
        commit: 'abc1234',
      }),
    )
    put(runDir, 'chapters/01.md', '본문\n')
    put(runDir, 'calls/001-chapter-extract.json', JSON.stringify(callRecord({ power: LOW })))
    put(
      runDir,
      'run-summary.json',
      JSON.stringify({
        calls: { total: 1 },
        power: { sampled: 1, lowPower: 1, onBattery: 0, byMode: { low: 1 }, bySource: { ac: 1 } },
      }),
    )
    put(runDir, 'state.json', JSON.stringify({ status: 'done', message: null }))

    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })
    const callText = readFileSync(path.join(dir, 'calls/001-chapter-extract.json'), 'utf8')
    expect(JSON.parse(callText)).not.toHaveProperty('power')
    expect(callText).not.toContain('modeRaw')
    expect(JSON.parse(readFileSync(path.join(dir, 'run-summary.json'), 'utf8'))).not.toHaveProperty(
      'power',
    )
    expect(existsSync(path.join(dir, 'config.json'))).toBe(false)
  })
})
