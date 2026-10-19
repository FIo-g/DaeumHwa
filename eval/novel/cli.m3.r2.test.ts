import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initRun, main, secondFlag } from './cli'
import { secondBlindDir } from './blind'

// Track M3 part a: the blind --second, publish-review --second and review-gate commands.

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-cli-m3-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function lastJsonLine(log: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const line = log.mock.calls.at(-1)?.[0]
  return JSON.parse(String(line)) as Record<string, unknown>
}

function verdictReview(qScores: number[], thresholdsFailed: string[] = []): string {
  const body = {
    schema: 'review-verdict-1',
    chapters: [{ chapter: 1, thresholdsFailed, qScores, verdict: 'not-publishable' }],
  }
  return `# Review\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`
}

describe('secondFlag', () => {
  it('is false when absent and true when a bare flag', () => {
    expect(secondFlag({})).toBe(false)
    expect(secondFlag({ second: true })).toBe(true)
  })

  it('throws when given a value', () => {
    expect(() => secondFlag({ second: 'x' })).toThrow('--second takes no value')
  })
})

describe('blind --second and publish-review --second', () => {
  it('blind --second builds blind-2 and keeps the first copy', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['blind', '--dir', dir])).toBe(0)
      const firstDir = lastJsonLine(log).dir as string
      writeFileSync(join(firstDir, 'review.md'), 'first review')

      expect(await main(['blind', '--dir', dir, '--second'])).toBe(0)
      const printed = String(lastJsonLine(log).dir)
      expect(printed.endsWith(join('blind-2', 'run-01-ko'))).toBe(true)
      expect(existsSync(join(firstDir, 'review.md'))).toBe(true)
      expect(printed).toBe(secondBlindDir(dir))
    } finally {
      log.mockRestore()
    }
  })

  it('blind --out wins over --second', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const out = join(tempDir(), 'custom')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['blind', '--dir', dir, '--out', out, '--second'])).toBe(0)
      expect(String(lastJsonLine(log).dir)).toBe(out)
    } finally {
      log.mockRestore()
    }
  })

  it('publish-review --second writes review-2.md and the docs file', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    mkdirSync(secondBlindDir(dir), { recursive: true })
    writeFileSync(join(secondBlindDir(dir), 'review.md'), '# Review\nbody')
    const docs = join(tempDir(), 'docs', 'second.md')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['publish-review', '--dir', dir, '--to', docs, '--second'])).toBe(0)
    } finally {
      log.mockRestore()
    }
    expect(readFileSync(docs, 'utf8')).toMatch(
      /^모델: fake \| 언어: ko \| 검토: 2\n\n# Review\nbody$/,
    )
    expect(existsSync(join(dir, 'review-2.md'))).toBe(true)
    expect(existsSync(join(dir, 'review.md'))).toBe(false)
  })
})

describe('review-gate', () => {
  it('prints the decision', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    writeFileSync(join(dir, 'review.md'), verdictReview([4, 3, 4, 3, 3, 4, 4, 4, 4]))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['review-gate', '--dir', dir])).toBe(0)
      const printed = lastJsonLine(log)
      expect(printed.decision).toBe('needed')
      expect(printed.reasons).toContain('q-mean-near-line')
    } finally {
      log.mockRestore()
    }
  })

  it('errors when review.md is missing', async () => {
    const dir = join(tempDir(), '2026-10-19', 'run-01-ko')
    initRun({ model: 'fake', lang: 'ko', dir })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['review-gate', '--dir', dir])).toBe(1)
      expect(String(lastJsonLine(log).error)).toContain('review.md missing')
    } finally {
      log.mockRestore()
    }
  })

  it('usage text lists review-gate', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await main(['nope'])).toBe(1)
      expect(String(lastJsonLine(log).error)).toContain('review-gate')
    } finally {
      log.mockRestore()
    }
  })
})
