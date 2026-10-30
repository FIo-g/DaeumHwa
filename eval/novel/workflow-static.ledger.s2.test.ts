import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file and summary prompt as text, for the ledger mode (stage 2,
// task 8). The workflow runs only inside the harness.
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')
const summaryPrompt = readFileSync(new URL('./agents/summary.md', import.meta.url), 'utf8')

describe('novel-eval workflow ledger mode (static)', () => {
  it('allows the ledger init flag', () => {
    expect(text).toContain("'--directives ledger'")
  })

  it('summary.md adds the cache read share column and the ledger note', () => {
    expect(summaryPrompt).toContain('캐시 읽기 비율')
    expect(summaryPrompt).toContain('ledgerChars')
  })
})
