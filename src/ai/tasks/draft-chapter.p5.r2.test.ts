import { describe, expect, it } from 'vitest'
import { PLANNED_THREAD_MARK } from '@/ai/context'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'

describe('P5 planned-thread rule', () => {
  const lines = DRAFT_SYSTEM.split('\n')
  const quoted = `"${PLANNED_THREAD_MARK}"`

  it('DRAFT_SYSTEM has exactly one rule that quotes the mark', () => {
    const matching = lines.filter((line) => line.includes(quoted))
    expect(matching).toHaveLength(1)
    expect(matching[0].startsWith('- ')).toBe(true)
  })

  it('the rule sits among the rules and names the instructions tag', () => {
    const ruleLine = lines.find((line) => line.includes(quoted)) ?? ''
    const ruleIndex = lines.indexOf(ruleLine)
    const headIndex = lines.indexOf('규칙:')
    const tagIndex = lines.indexOf(TAG_DATA_RULE)
    expect(headIndex).toBeGreaterThanOrEqual(0)
    expect(ruleIndex).toBeGreaterThan(headIndex)
    expect(ruleIndex).toBeLessThan(tagIndex)
    expect(ruleLine).toContain('<instructions>')
    expect(ruleLine).toContain('쓰지 않는다')
  })

  it('the first rule is still first', () => {
    const firstRuleIndex = lines.findIndex((line) =>
      line.startsWith('- 작가의 지시(<instructions>)에 있는 사건만 쓴다'),
    )
    const ruleIndex = lines.findIndex((line) => line.includes(quoted))
    expect(firstRuleIndex).toBe(lines.indexOf('규칙:') + 1)
    expect(ruleIndex).toBeGreaterThan(firstRuleIndex)
  })
})
