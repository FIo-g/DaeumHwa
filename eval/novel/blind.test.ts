import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallRecord } from './eval-client'
import {
  BLIND_LABEL,
  blindCallRecord,
  blindRunSummary,
  defaultBlindDir,
  findLeaks,
  maskBrandWords,
  maskModelNames,
  maskOperationalText,
  maskProviderNames,
  modelNeedles,
  publishReview,
  writeBlindCopy,
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
    const masked = maskBrandWords(
      'I am Claude Haiku, by Anthropic. Qwen3 and EXAONE, sonnet. Claude v1.3 30.0%. Luna 루나',
    )
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
    const qwen = blindCallRecord(
      callRecord({ error: { kind: 'model', message: 'pull qwen3.8:27b failed' } }),
    )
    expect(qwen.error?.message).not.toContain('qwen3.8')
    const ollama = blindCallRecord(
      callRecord({ error: { kind: 'model', message: 'Ollama model not found, try pulling' } }),
    )
    expect(ollama.error?.message).not.toMatch(/ollama/i)
    const opencode = blindCallRecord(
      callRecord({ error: { kind: 'model', message: 'OpenCode failed' } }),
    )
    expect(opencode.error?.message).not.toMatch(/opencode/i)
  })

  it('masks brand words a model prints in its output and keeps Luna', () => {
    const output =
      'I am Claude Haiku, made by Anthropic; also Qwen and EXAONE, Sonnet, Opus, gpt-oss. I am claude haiku, qwen. 루나 Luna'
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

const CONFIG = {
  runId: 'run-01',
  modelId: 'haiku-5.5',
  lang: 'ko',
  chapters: 1,
  questions: 1,
  maxDraftAttempts: 3,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'abc1234',
}

function put(root: string, rel: string, content: string): void {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** A finished run with every kind of file the reviewer may read, plus files the copy must leave out. */
function buildRun(name = 'run-01-ko'): string {
  const runDir = path.join(tempDir(), '2026-10-19', name)
  put(runDir, 'config.json', JSON.stringify(CONFIG, null, 2))
  put(runDir, 'chapters/01.md', '루나가 배를 몬다. Luna steers the ship.\n')
  put(
    runDir,
    'calls/001-chapter-extract.json',
    JSON.stringify(
      callRecord({
        seq: 1,
        task: 'chapter-extract',
        output: { note: 'claude-haiku-5-5 wrote this' },
      }),
      null,
      2,
    ),
  )
  put(runDir, 'metrics/01.json', JSON.stringify({ chars: 10, foreignRuns: [] }))
  put(runDir, 'reader/01.json', JSON.stringify({ text: 'gpt-oss:20b reads it' }))
  put(runDir, 'wiki-final.json', JSON.stringify({ note: 'exaone3.5:32b' }))
  put(runDir, 'author-decisions.jsonl', '{"model":"exaone3.5:32b"}\n')
  put(
    runDir,
    'run-summary.json',
    JSON.stringify({ speed: { overall: { source: 'ollama' } }, calls: { total: 1 } }),
  )
  put(runDir, 'state.json', JSON.stringify({ status: 'done', message: null }))
  put(runDir, 'worker.log', 'Ollama: model "qwen3.8:27b-mlx" not found, try pulling it first\n')
  put(runDir, 'db/x', 'private')
  put(runDir, 'RESUME.md', 'private')
  put(runDir, 'review.md', 'old review')
  put(runDir, 'pending.json', '{}')
  put(runDir, 'answer.json', '{}')
  put(runDir, 'worker.pid', '123')
  return runDir
}

describe('writeBlindCopy', () => {
  it('copies only the allow-list, blinded', () => {
    const runDir = buildRun()
    const { dir, files } = writeBlindCopy(runDir, { repoRoot: process.cwd() })

    expect(dir).toBe(defaultBlindDir(runDir))
    expect(files).toBeGreaterThan(0)
    for (const absent of [
      'config.json',
      'db',
      'RESUME.md',
      'review.md',
      'pending.json',
      'answer.json',
      'worker.pid',
    ]) {
      expect(existsSync(path.join(dir, absent))).toBe(false)
    }
    expect(readFileSync(path.join(dir, 'chapters/01.md'), 'utf8')).toBe(
      readFileSync(path.join(runDir, 'chapters/01.md'), 'utf8'),
    )
    const call = JSON.parse(readFileSync(path.join(dir, 'calls/001-chapter-extract.json'), 'utf8'))
    expect(call.model).toBe(BLIND_LABEL)
    expect(call).not.toHaveProperty('speed')
    expect(JSON.parse(readFileSync(path.join(dir, 'run-summary.json'), 'utf8'))).not.toHaveProperty(
      'speed',
    )
    expect(existsSync(path.join(dir, 'state.json'))).toBe(true)
    const log = readFileSync(path.join(dir, 'worker.log'), 'utf8')
    expect(log).not.toMatch(/ollama|qwen3\.8/i)
    expect(existsSync(path.join(dir, 'reference/criteria.md'))).toBe(true)
    expect(existsSync(path.join(dir, 'reference/spec-section-9.md'))).toBe(true)
  })

  it('masks the reference docs the reviewer reads', () => {
    const { dir } = writeBlindCopy(buildRun(), { repoRoot: process.cwd() })
    const criteria = readFileSync(path.join(dir, 'reference/criteria.md'), 'utf8')
    const section = readFileSync(path.join(dir, 'reference/spec-section-9.md'), 'utf8')

    for (const text of [criteria, section]) {
      expect(text).not.toMatch(/haiku|luna|sonnet|opus|qwen|exaone|ollama|opencode/i)
    }
    expect(section.startsWith('## 9.')).toBe(true)
    expect(section).not.toContain('## 10.')
    expect(criteria).toContain('Claude v1.3')
    expect(criteria).toContain('GPT-4')
  })

  it('leaves no model name in a full copy', () => {
    const runDir = buildRun()
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })

    expect(findLeaks(dir)).toEqual([])
    for (const rel of [
      'calls/001-chapter-extract.json',
      'state.json',
      'run-summary.json',
      'worker.log',
    ]) {
      expect(readFileSync(path.join(dir, rel), 'utf8')).not.toContain('claude-haiku-5-5')
    }
  })

  it('replaces an old copy when rebuilt', () => {
    const runDir = buildRun()
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })
    put(dir, 'review.md', 'stale review')
    writeBlindCopy(runDir, { repoRoot: process.cwd() })

    expect(existsSync(path.join(dir, 'review.md'))).toBe(false)
  })

  it('throws on a directory that is not a run', () => {
    const empty = tempDir()
    expect(() => writeBlindCopy(empty, { repoRoot: process.cwd() })).toThrow('not a run dir')
  })

  it('copies a partial run dir without throwing', () => {
    const runDir = path.join(tempDir(), 'run-01-ko')
    put(runDir, 'config.json', JSON.stringify(CONFIG))
    put(runDir, 'chapters/01.md', 'text\n')
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })

    expect(existsSync(path.join(dir, 'chapters/01.md'))).toBe(true)
    expect(existsSync(path.join(dir, 'reference/criteria.md'))).toBe(true)
    expect(existsSync(path.join(dir, 'reference/spec-section-9.md'))).toBe(true)
    expect(existsSync(path.join(dir, 'calls'))).toBe(false)
    expect(existsSync(path.join(dir, 'run-summary.json'))).toBe(false)
    expect(existsSync(path.join(dir, 'state.json'))).toBe(false)
  })

  it('refuses an out dir that is the run, its parent, or inside it', () => {
    const runDir = buildRun()
    const before = readFileSync(path.join(runDir, 'config.json'), 'utf8')
    for (const out of [runDir, path.dirname(runDir), path.join(runDir, 'x')]) {
      expect(() => writeBlindCopy(runDir, { out, repoRoot: process.cwd() })).toThrow(
        'unsafe blind output dir',
      )
    }
    expect(readFileSync(path.join(runDir, 'config.json'), 'utf8')).toBe(before)
  })

  it('masks reader, wiki and decisions files and keeps chapters as written', () => {
    const runDir = buildRun()
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })

    expect(readFileSync(path.join(dir, 'reader/01.json'), 'utf8')).toContain(BLIND_LABEL)
    expect(readFileSync(path.join(dir, 'reader/01.json'), 'utf8')).not.toContain('gpt-oss')
    expect(readFileSync(path.join(dir, 'wiki-final.json'), 'utf8')).not.toContain('exaone')
    expect(readFileSync(path.join(dir, 'author-decisions.jsonl'), 'utf8')).not.toContain('exaone')
    expect(readFileSync(path.join(dir, 'chapters/01.md'), 'utf8')).toContain('Luna')
  })
})

describe('findLeaks', () => {
  it('flags only the planted leaks and never chapters', () => {
    const dir = tempDir()
    put(dir, 'calls/001-x.json', '{"model":"claude-haiku-5-5"}')
    put(dir, 'reference/criteria.md', 'Haiku is named here')
    put(dir, 'reference/spec-section-9.md', 'Luna is named here')
    put(dir, 'reader/01.json', '{"text":"qwen3.8:27b"}')
    put(dir, 'worker.log', 'Ollama stderr')
    put(dir, 'state.json', '{"message":"I am Claude"}')
    put(dir, 'chapters/01.md', 'Luna walks in.')

    expect(findLeaks(dir)).toEqual([
      'calls/001-x.json',
      'reader/01.json',
      'reference/criteria.md',
      'reference/spec-section-9.md',
      'state.json',
      'worker.log',
    ])
  })

  it('reports nothing for a clean copy', () => {
    const dir = tempDir()
    put(dir, 'reference/criteria.md', '[모델] is named here')
    put(dir, 'calls/001-x.json', `{"model":"${BLIND_LABEL}"}`)
    expect(findLeaks(dir)).toEqual([])
  })
})

describe('publishReview', () => {
  it('adds the model header and writes the same text to the run dir', () => {
    const runDir = buildRun('run-01-en')
    put(runDir, 'config.json', JSON.stringify({ ...CONFIG, lang: 'en' }))
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })
    put(dir, 'review.md', '# Review\nbody')
    const docs = path.join(tempDir(), 'docs', 'a.md')

    const result = publishReview(runDir, docs)

    expect(existsSync(path.join(dir, 'config.json'))).toBe(false)
    expect(result).toEqual({ docsPath: docs, runReviewPath: path.join(runDir, 'review.md') })
    const expected = 'Model: haiku-5.5 | Language: en\n\n# Review\nbody'
    expect(readFileSync(docs, 'utf8')).toBe(expected)
    expect(readFileSync(path.join(runDir, 'review.md'), 'utf8')).toBe(expected)
  })

  it('writes the Korean header for a ko run', () => {
    const runDir = buildRun('run-01-ko')
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })
    put(dir, 'review.md', '# 검토\n본문')
    const docs = path.join(tempDir(), 'docs', 'a.md')

    publishReview(runDir, docs)

    expect(readFileSync(docs, 'utf8')).toBe('모델: haiku-5.5 | 언어: ko\n\n# 검토\n본문')
  })

  it('throws when the blind review is missing', () => {
    const runDir = buildRun()
    writeBlindCopy(runDir, { repoRoot: process.cwd() })
    expect(() => publishReview(runDir, path.join(tempDir(), 'a.md'))).toThrow('review.md missing')
  })

  it('uses the default blind dir and leaves no run review when the docs write fails', () => {
    const runDir = buildRun()
    const { dir } = writeBlindCopy(runDir, { repoRoot: process.cwd() })
    put(dir, 'review.md', 'body')
    rmSync(path.join(runDir, 'review.md'))

    const root = tempDir()
    put(root, 'x', 'a regular file')
    expect(() => publishReview(runDir, path.join(root, 'x', 'sub', 'a.md'))).toThrow()
    expect(existsSync(path.join(runDir, 'review.md'))).toBe(false)

    const ok = path.join(root, 'docs', 'a.md')
    publishReview(runDir, ok)
    expect(readFileSync(ok, 'utf8')).toContain('body')
    expect(readFileSync(path.join(runDir, 'review.md'), 'utf8')).toContain('body')
  })
})
