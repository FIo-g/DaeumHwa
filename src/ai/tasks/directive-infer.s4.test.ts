import { describe, expect, it } from 'vitest'
import {
  DIRECTIVE_INFER_SYSTEM,
  directiveInferTask,
  DirectiveInferSchema,
  type DirectiveInferInput,
} from '@/ai/tasks/directive-infer'
import type { DirectiveForPrompt } from '@/lib/directives'
import { DIRECTIVE_INFER_SYSTEM as EN_DIRECTIVE_INFER_SYSTEM } from '../../../eval/novel/localize/en/directive-infer'
import { directiveInferSample } from '../../../eval/novel/localize/samples/directive-infer'
import { findHangul, translateScaffold } from '../../../eval/novel/localize/scaffold'

function request(text: string): DirectiveForPrompt {
  return {
    id: 'req-1',
    scope: 'work',
    kind: 'style',
    text,
    pattern: null,
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
  }
}

function input(): DirectiveInferInput {
  return {
    hunks: Array.from({ length: 12 }, (_, i) => ({
      before: `옛 문장 ${i}번이다.`,
      after: `새 문장 ${i}번이다.`,
    })),
    requests: [request('짧은 문장으로 쓴다.')],
    names: ['세린'],
  }
}

describe('directiveInferTask.buildPrompt', () => {
  it('lists each hunk as [수정 N] with 전 and 후 lines after the requests block', () => {
    const prompt = directiveInferTask.buildPrompt(input())
    expect(prompt).toContain('<author_requests>')
    expect(prompt).toContain('<edits>')
    expect(prompt).toContain('[수정 1]')
    expect(prompt).toContain('[수정 2]')
    expect(prompt).toContain('- 전:')
    expect(prompt).toContain('- 후:')
    expect(prompt.indexOf('<author_requests>')).toBeLessThan(prompt.indexOf('<edits>'))
  })

  it('omits the requests block when there are no requests', () => {
    const prompt = directiveInferTask.buildPrompt({ ...input(), requests: [] })
    expect(prompt).not.toContain('<author_requests>')
    expect(prompt).toContain('[수정 1]')
  })
})

describe('directiveInferTask definition', () => {
  it('runs at low effort with 2000 max tokens', () => {
    expect(directiveInferTask.name).toBe('directive-infer')
    expect(directiveInferTask.effort).toBe('low')
    expect(directiveInferTask.maxTokens).toBe(2000)
    expect(directiveInferTask.system).toBe(DIRECTIVE_INFER_SYSTEM)
  })

  it('validates the proposal shape and limits', () => {
    const output = {
      proposals: [
        {
          text: "'입꼬리'는 쓰지 않는다.",
          kind: 'style',
          entryName: null,
          pattern: '입꼬리',
          evidence: [1, 2],
        },
      ],
    }
    expect(DirectiveInferSchema.parse(output)).toEqual(output)
    expect(() =>
      DirectiveInferSchema.parse({
        proposals: [{ ...output.proposals[0], text: '가'.repeat(121) }],
      }),
    ).toThrow()
    expect(() =>
      DirectiveInferSchema.parse({
        proposals: [output.proposals[0], output.proposals[0], output.proposals[0]],
      }),
    ).toThrow()
  })

  it('postProcess drops vague, empty-evidence, out-of-range and unknown-character proposals', () => {
    const good = {
      text: "'입꼬리'는 쓰지 않는다.",
      kind: 'ban' as const,
      entryName: null,
      pattern: '입꼬리',
      evidence: [1, 2],
    }
    const output = directiveInferTask.postProcess!(
      {
        proposals: [
          good,
          { ...good, text: '문장을 자연스럽게 쓴다.' },
          { ...good, text: "'문장은 짧게 쓴다.'", evidence: [] },
          { ...good, text: "'문장은 짧게 쓴다.'", evidence: [13] },
          { ...good, text: "'도윤서는 반말을 쓴다.'", entryName: '도윤서' },
        ],
      },
      input(),
    )
    expect(output.proposals).toEqual([good])
  })
})

describe('directive-infer English localization', () => {
  it('leaves no Hangul', () => {
    expect(findHangul(EN_DIRECTIVE_INFER_SYSTEM)).toEqual([])
    expect(findHangul(DIRECTIVE_INFER_SYSTEM)).not.toEqual([])
    expect(findHangul(translateScaffold(directiveInferSample))).toEqual([])
  })

  it('returns an empty proposal list when nothing is clear', () => {
    expect(DIRECTIVE_INFER_SYSTEM).toContain('{"proposals": []}')
  })
})
