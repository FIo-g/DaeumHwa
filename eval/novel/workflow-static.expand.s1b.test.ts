import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline check of the workflow file as text: `--length-mode continue` is an allowed per-run flag
// (stage 1b). The workflow runs only inside the harness, so this reads the script as text.
const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')

describe('novel-eval workflow length-mode flag (static)', () => {
  it('lists --length-mode continue among the allowed init flags', () => {
    const list = text.slice(text.indexOf('const ALLOWED_RUN_FLAGS = ['))
    const body = list.slice(0, list.indexOf(']'))
    expect(body).toContain("'--length-mode continue'")
  })
})
