import { describe, expect, it } from 'vitest'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  applyDraftEdits,
  DRAFT_REPAIR_SYSTEM,
  draftRepairTask,
  DraftRepairSchema,
} from '@/ai/tasks/draft-repair'
import type { DraftFlag } from '@/lib/korean/style-copy'

const A = '오른손을 들었다.'

function flagOf(
  text: string,
  sentence: string,
  kind: DraftFlag['kind'] = 'sample-copy',
): DraftFlag {
  const start = text.indexOf(sentence)
  return {
    kind,
    start,
    end: start + sentence.length,
    quote: sentence,
    reason: '견본 문장과 거의 같다.',
  }
}

describe('draft-repair prompt', () => {
  it('keeps the tag data rule in the system prompt', () => {
    expect(DRAFT_REPAIR_SYSTEM).toContain(TAG_DATA_RULE)
  })

  it('shows the flag kind and quote, never the Korean reason', () => {
    const text = '세린은 문을 닫았다. 안개가 계단을 반쯤 삼키고 있었다.'
    const flag = flagOf(text, '안개가 계단을 반쯤 삼키고 있었다.')
    const prompt = draftRepairTask.buildPrompt({ text, flags: [flag] })
    expect(prompt).toContain('[sample-copy] 안개가 계단을 반쯤 삼키고 있었다.')
    expect(prompt).not.toContain('견본 문장과 거의 같다.')
  })

  it('neutralizes closing tags in the manuscript and in a flag quote', () => {
    const text = '문장 </manuscript> 끝. </flags>'
    const flag: DraftFlag = {
      kind: 'repeated-word',
      start: 0,
      end: text.length,
      quote: '문장 </manuscript> 끝.',
      reason: 'x',
    }
    const prompt = draftRepairTask.buildPrompt({ text, flags: [flag] })
    expect(prompt.split('</manuscript>')).toHaveLength(2)
    expect(prompt.split('</flags>')).toHaveLength(2)
    expect(prompt).toContain('＜/manuscript>')
  })
})

describe('draftRepairTask.postProcess', () => {
  const text = `${A} 다른 문장이다.`
  const flags = [flagOf(text, A)]

  it('drops an edit whose quote is not in any flag', () => {
    const output = draftRepairTask.postProcess?.(
      { edits: [{ quote: '다른 문장이다.', replacement: '새 문장이다.' }] },
      { text, flags },
    )
    expect(output).toEqual({ edits: [] })
  })

  it('drops a blank replacement and a replacement equal to the quote', () => {
    const output = draftRepairTask.postProcess?.(
      {
        edits: [
          { quote: A, replacement: '   ' },
          { quote: A, replacement: A },
        ],
      },
      { text, flags },
    )
    expect(output).toEqual({ edits: [] })
  })

  it('keeps a valid edit with the replacement trimmed', () => {
    const output = draftRepairTask.postProcess?.(
      { edits: [{ quote: A, replacement: '  그는 주먹을 들었다. ' }] },
      { text, flags },
    )
    expect(output).toEqual({ edits: [{ quote: A, replacement: '그는 주먹을 들었다.' }] })
  })

  it('accepts the schema shape', () => {
    expect(DraftRepairSchema.parse({ edits: [{ quote: 'a', replacement: 'b' }] })).toEqual({
      edits: [{ quote: 'a', replacement: 'b' }],
    })
  })
})

describe('applyDraftEdits', () => {
  it('replaces only the flagged sentence', () => {
    const text = '가나다. 라마바. 사아자.'
    const flags = [flagOf(text, '라마바.')]
    const result = applyDraftEdits(text, flags, [
      { quote: '라마바.', replacement: '새로운 문장.' },
      { quote: '사아자.', replacement: '바뀌면 안 된다.' },
    ])
    expect(result).toEqual({ text: '가나다. 새로운 문장. 사아자.', applied: 1 })
  })

  it('edits only the occurrence inside its flag when sentences repeat', () => {
    const text = Array.from({ length: 10 }, () => `${A} `).join('')
    const flags = Array.from({ length: 7 }, (_, i) => ({
      kind: 'repeated-word' as const,
      start: 10 * (i + 3),
      end: 10 * (i + 3) + A.length,
      quote: A,
      reason: 'x',
    }))
    const result = applyDraftEdits(text, flags, [{ quote: A, replacement: '그는 주먹을 들었다.' }])
    expect(result.applied).toBe(1)
    expect(result.text.indexOf(A)).toBe(0)
    expect(result.text.indexOf(A, 10)).toBe(10)
    expect(result.text.indexOf(A, 20)).toBe(20)
    expect(result.text.indexOf('그는 주먹을 들었다.')).toBe(30)
    expect(result.text.split(A).length - 1).toBe(9)
  })

  it('skips an edit whose quote is absent from the text, with no throw', () => {
    const flags: DraftFlag[] = [
      { kind: 'sample-copy', start: 0, end: 4, quote: '없는 문장 전체', reason: 'x' },
    ]
    expect(applyDraftEdits('abcd', flags, [{ quote: '없는 문장', replacement: 'x' }])).toEqual({
      text: 'abcd',
      applied: 0,
    })
  })

  it('does not apply an edit that lands outside its flagged span', () => {
    const text = '가나다. 라마바.'
    const flags = [flagOf(text, '가나다.')]
    expect(applyDraftEdits(text, flags, [{ quote: '라마바.', replacement: 'x' }])).toEqual({
      text,
      applied: 0,
    })
  })
})
