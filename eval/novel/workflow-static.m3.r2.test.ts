import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file, for the second-review flow (M3). The static checks read the
// file as text. The behaviour checks evaluate it as a function body with fake agents, so no real
// agent or CLI runs.
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')

/** The argument texts of each call to publish(...) or publishPrompt(...), with nesting respected. */
function callArgs(source: string): { name: string; args: string[] }[] {
  const calls: { name: string; args: string[] }[] = []
  for (const match of source.matchAll(/\bpublish(Prompt)?\(/g)) {
    const index = match.index ?? 0
    const before = source.slice(0, index)
    if (/(^|\s)function $/.test(before)) continue
    const args: string[] = []
    let current = ''
    let depth = 1
    for (let i = index + match[0].length; i < source.length && depth > 0; i++) {
      const ch = source[i] as string
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (depth === 0) break
      if (ch === ',' && depth === 1) {
        args.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    if (current.trim() !== '') args.push(current.trim())
    calls.push({ name: match[1] ? 'publishPrompt' : 'publish', args })
  }
  return calls
}

type Call = { prompt: string; options: { label?: string; model?: string } }

/** Runs the workflow body with fake globals. The gate answers with the given decision. */
async function runWorkflow(
  args: Record<string, unknown>,
  gateDecision: string | null,
  overrides: { gateStatus?: string; gateDetail?: string; reviewerAnswer?: unknown } = {},
) {
  const calls: Call[] = []
  const logs: string[] = []
  const agent = async (prompt: string, options: Call['options']) => {
    calls.push({ prompt, options })
    if (prompt.includes('review-gate')) {
      if (gateDecision === null) return null
      return {
        status: overrides.gateStatus ?? gateDecision,
        detail: overrides.gateDetail ?? JSON.stringify({ decision: gateDecision }),
      }
    }
    if (prompt.includes('publish-review')) return { status: 'copied', detail: 'docs' }
    if (prompt.includes('eval:novel publish ')) {
      return { status: 'copied', detail: '{"status":"copied"}' }
    }
    if (prompt.includes('eval:novel blind')) return { status: 'blinded', detail: 'x' }
    if (prompt.includes('reviewer.md')) {
      return 'reviewerAnswer' in overrides ? overrides.reviewerAnswer : 'reviewed: 1 chapters'
    }
    if (prompt.includes('test -f')) return { status: 'missing', detail: '' }
    if (prompt.includes('eval:novel advance')) {
      return { status: 'done', detail: '{"status":"done"}' }
    }
    if (prompt.includes('summary.md')) return 'wrote'
    return null
  }
  const parallel = (fns: (() => Promise<unknown>)[]) => Promise.all(fns.map((f) => f()))
  const phase = () => undefined
  const log = (message: string) => {
    logs.push(message)
  }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...params: string[]
  ) => (...values: unknown[]) => Promise<unknown>
  const run = new AsyncFunction(
    'args',
    'agent',
    'parallel',
    'phase',
    'log',
    text.replace('export const meta =', 'const meta ='),
  )
  const result = await run(args, agent, parallel, phase, log)
  return { result, calls, logs }
}

const baseArgs = {
  date: '2026-10-19-r2a',
  chapters: 1,
  runs: [{ model: 'haiku-5.5', lang: 'ko' }],
}

const reviewerPrompts = (calls: Call[]) => calls.filter((c) => c.prompt.includes('reviewer.md'))

describe('novel-eval workflow (static, M3 second review)', () => {
  it('gate, blind-2 and second paths exist', () => {
    expect(text).toContain('review-gate --dir')
    expect(text).toContain("'/blind-2/'")
    expect(text).toContain('/second/${run.model}-${run.lang}.md')
  })

  it('second flag is last on both commands', () => {
    const lines = text.split('\n').filter((line) => line.includes('--second'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).not.toMatch(/--second.* --/)
    }
    expect(text).toContain("' --second'")
  })

  it('publish calls keep four arguments and publishPrompt calls three', () => {
    const calls = callArgs(text)
    const prompts = calls.filter((call) => call.name === 'publishPrompt')
    const copies = calls.filter((call) => call.name === 'publish')

    expect(prompts.length).toBeGreaterThanOrEqual(1)
    expect(copies.length).toBeGreaterThanOrEqual(4)
    for (const call of prompts) expect(call.args).toHaveLength(3)
    for (const call of copies) expect(call.args).toHaveLength(4)
    expect(copies.some((call) => call.args[0]?.includes('review-2.md'))).toBe(true)
  })
})

describe('novel-eval workflow (behaviour, M3 second review)', () => {
  it('a not-needed decision means one reviewer', async () => {
    const { calls } = await runWorkflow(baseArgs, 'not-needed')
    expect(reviewerPrompts(calls)).toHaveLength(1)
    expect(calls.some((c) => c.prompt.includes('review-gate --dir'))).toBe(true)
  })

  it('a needed decision runs a second reviewer on a separate blind-2 copy', async () => {
    const { calls } = await runWorkflow(baseArgs, 'needed')
    const reviewers = reviewerPrompts(calls)
    expect(reviewers).toHaveLength(2)
    expect(reviewers[0]?.prompt).toContain('/blind/run-04-ko')
    expect(reviewers[1]?.prompt).toContain('/blind-2/run-04-ko')
    expect(reviewers[1]?.prompt).not.toContain('/blind/')

    const prompts = calls.map((c) => c.prompt)
    expect(prompts.some((p) => /pnpm eval:novel blind --dir \S+ --second$/m.test(p))).toBe(true)
    expect(
      prompts.some((p) =>
        /pnpm eval:novel publish-review --dir \S+ --to \S+second\/haiku-5\.5-ko\.md --second$/m.test(
          p,
        ),
      ),
    ).toBe(true)
    expect(
      prompts.some((p) =>
        p.includes(
          '--src eval/results/novel/2026-10-19-r2a/run-04-ko/review-2.md --dest docs/eval/novel/2026-10-19-r2a/second/haiku-5.5-ko.md',
        ),
      ),
    ).toBe(true)
  })

  it('the second reviewer prompt is the same text as the first apart from the folder', async () => {
    const { calls } = await runWorkflow(baseArgs, 'needed')
    const [first, second] = reviewerPrompts(calls).map((c) => c.prompt)
    expect(second?.replace(/blind-2/g, 'blind')).toBe(first)
    expect(reviewerPrompts(calls).map((c) => c.options.label)).toEqual([
      'review haiku-5.5-ko',
      'review 2 haiku-5.5-ko',
    ])
  })

  it('already-done copies only if the docs file is missing', async () => {
    const { calls } = await runWorkflow(baseArgs, 'already-done')
    expect(reviewerPrompts(calls)).toHaveLength(1)
    const copy = calls.find(
      (c) => c.prompt.includes('review-2.md') && c.prompt.includes('--if-missing'),
    )
    expect(copy).toBeDefined()
  })

  it('args.secondReview false skips the gate', async () => {
    const { calls } = await runWorkflow({ ...baseArgs, secondReview: false }, 'needed')
    expect(calls.some((c) => c.prompt.includes('review-gate'))).toBe(false)
    expect(reviewerPrompts(calls)).toHaveLength(1)
  })

  it('a failed first review skips the gate', async () => {
    const { calls } = await runWorkflow(baseArgs, 'needed', { reviewerAnswer: null })
    expect(calls.some((c) => c.prompt.includes('review-gate'))).toBe(false)
  })

  it('a failing gate does not fail the run', async () => {
    const { result, calls } = await runWorkflow(baseArgs, 'needed', {
      gateStatus: 'failed',
      gateDetail: 'boom',
    })
    const runs = (result as { runs: { status: string }[] }).runs
    expect(runs[0]?.status).toBe('done')
    expect(reviewerPrompts(calls)).toHaveLength(1)
  })

  it('summary prompt mentions second reviews', async () => {
    const { calls } = await runWorkflow({ ...baseArgs, summary: true }, 'not-needed')
    const summary = calls.find((c) => c.prompt.includes('summary.md'))
    expect(summary?.prompt).toContain('second/')
  })
})
