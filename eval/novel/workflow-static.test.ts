import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Offline checks of the workflow file as text. The workflow runs only inside the harness, so these
// catch the mistakes a review would catch: a removed helper still called, a publish call with the
// wrong argument count, and a summary path written under docs/ by the agent.
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

describe('novel-eval workflow (static)', () => {
  it('copyPrompt is gone', () => {
    expect(text).not.toContain('copyPrompt')
  })

  it('publish and publishPrompt calls match their signatures', () => {
    const calls = callArgs(text)
    const prompts = calls.filter((call) => call.name === 'publishPrompt')
    const copies = calls.filter((call) => call.name === 'publish')

    expect(prompts.length).toBeGreaterThanOrEqual(1)
    expect(copies.length).toBeGreaterThanOrEqual(3)
    for (const call of prompts) expect(call.args).toHaveLength(3)
    for (const call of copies) expect(call.args).toHaveLength(4)
    expect(text).toContain("publish(summaryResultPath(), docsSummaryPath(), false, 'summary')")
  })

  it('summaryPrompt does not name a docs write path', () => {
    const start = text.indexOf('function summaryPrompt(')
    expect(start).toBeGreaterThan(-1)
    const rest = text.slice(start + 1)
    const end = rest.search(/\n(?:async function|function|const) /)
    const body = end === -1 ? rest : rest.slice(0, end)

    expect(body).not.toContain('docs/eval/novel/${date}/summary.md')
    expect(body).toContain('summaryResultPath()')
  })

  it('docsSummaryPath is the only place that names the docs summary path', () => {
    const literal = 'docs/eval/novel/${date}/summary.md'
    expect(text.split(literal)).toHaveLength(2)
  })
})
