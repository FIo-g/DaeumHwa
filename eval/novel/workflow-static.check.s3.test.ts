import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file as text and the summary prompt, for the check-and-fix flag
// and columns (stage 3, task 6).
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')
const summaryPrompt = readFileSync(new URL('./agents/summary.md', import.meta.url), 'utf8')

describe('novel-eval workflow check-and-fix (static)', () => {
  it('lists --scene-fix off in the allowed run flags', () => {
    expect(text).toContain("'--scene-fix off'")
  })

  it('summary.md gains the 점검 장면 and 고친 장면 columns', () => {
    expect(summaryPrompt).toContain('점검 장면')
    expect(summaryPrompt).toContain('고친 장면')
  })
})
