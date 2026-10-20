import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file as text, for the per-run init flags (stage 0, task 6). The
// workflow runs only inside the harness, so these read the script and the summary prompt as text.
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')
const summaryPrompt = readFileSync(new URL('./agents/summary.md', import.meta.url), 'utf8')

describe('novel-eval workflow per-run flags (static)', () => {
  it('lists the allowed init flags', () => {
    expect(text).toContain('const ALLOWED_RUN_FLAGS = [')
    for (const flag of [
      "'--deploy-settings'",
      "'--directives on'",
      "'--few-instructions'",
      "'--product-limits'",
      "'--speech on'",
      "'--two-step on'",
      "'--helper-think",
    ]) {
      expect(text).toContain(flag)
    }
  })

  it('runnerPrompt puts the run flags after --dir', () => {
    expect(text).toMatch(/--dir \$\{dir\}\$\{flagText\(run\)\}/)
  })

  it('the description mentions flags', () => {
    const match = text.match(/description:\s*\n?\s*'([^']*)'/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toContain('flags')
  })

  it('summary.md names the harness, first-char, must-fix and directive columns', () => {
    for (const term of ['harness', 'firstCharMs', 'mustFix', 'directives']) {
      expect(summaryPrompt).toContain(term)
    }
  })

  it('summary.md gives the chapter cost to four decimals and a dash for null usd', () => {
    expect(summaryPrompt).toContain('four decimals (for example 0.0273)')
    expect(summaryPrompt).not.toContain('two decimals')
    expect(summaryPrompt).toMatch(/`usd` is null[^\n]*`—`|`—`[^\n]*`usd` is null/)
  })
})
