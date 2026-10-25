import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')

describe('novel-eval workflow learn flags (static)', () => {
  it('allows learn and bank flags', () => {
    expect(text).toContain("'--directives learn'")
    expect(text).toContain("'--example-bank on'")
  })
})
