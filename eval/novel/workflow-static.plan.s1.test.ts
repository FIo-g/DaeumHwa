import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file and the summary prompt as text, for the stage 1 flags and
// summary columns (stage 1, task 7). The workflow runs only inside the harness.
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')
const summaryPrompt = readFileSync(new URL('./agents/summary.md', import.meta.url), 'utf8')

describe('novel-eval workflow stage 1 flags (static)', () => {
  it('allows the quick flag and the scenes draft mode', () => {
    expect(text).toContain("'--quick'")
    expect(text).toContain("'--draft-mode scenes'")
  })

  it('summary.md names the plan time, plan edit and scene length columns', () => {
    for (const term of ['planMs', 'planEdits', 'sceneLengths']) {
      expect(summaryPrompt).toContain(term)
    }
    expect(summaryPrompt).toContain('계획 시간(초)')
    expect(summaryPrompt).toContain('계획 수정(번)')
    expect(summaryPrompt).toContain('장면 분량 맞음(개/전체)')
  })
})
