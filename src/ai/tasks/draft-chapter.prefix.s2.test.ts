import { describe, expect, it } from 'vitest'
import type { DirectiveForPrompt } from '@/lib/directives'
import { buildDraftPrefix, buildDraftPrompt, type DraftPromptInput } from '@/ai/tasks/draft-chapter'

// Stage 2 (task 4): the writing prompt is a cached prefix (requests, voices, style cards, core
// entries, then the previous summary and tail) followed by the per-call rest.

const input: DraftPromptInput = {
  instructions: '서윤이 편지를 발견한다.',
  targetChars: 5500,
  styleCards: [
    {
      name: '서윤 말투',
      entryName: '서윤',
      tone: '단호하고 짧다.',
      rules: '반말을 쓴다.',
      examples: '',
    },
  ],
  packText: '현재 회차: 4화',
  previousSummary: null,
  previousTail: null,
  chapterLabel: '4화 (새 회차)',
}

const workRequest: DirectiveForPrompt = {
  id: 'd1',
  scope: 'work',
  kind: 'style',
  text: '모든 장면에서 짧은 문장을 쓴다.',
  pattern: null,
  speechLevel: null,
  targetChars: null,
  chapterPosition: null,
  entryId: null,
  entryName: null,
}

const styleCardsBlock = [
  '<style_cards>',
  '[인물 서윤] 서윤 말투',
  '- 말투: 단호하고 짧다.',
  '- 규칙: 반말을 쓴다.',
  '</style_cards>',
].join('\n')

const previousBlock = [
  '<previous_summary>',
  '(없음)',
  '</previous_summary>',
  '',
  '<previous_tail>',
  '(없음)',
  '</previous_tail>',
].join('\n')

describe('draft prompt prefix (stage 2)', () => {
  it('without requests, core or voices, block A is only the style cards and block B the previous text', () => {
    expect(buildDraftPrefix(input)).toEqual([styleCardsBlock, previousBlock])
  })

  it('keeps every tag of the old draft prompt once across the prefix and the rest', () => {
    const joined = [...buildDraftPrefix(input), buildDraftPrompt(input)].join('\n\n')
    for (const tag of [
      '<chapter>',
      '<instructions>',
      '<style_cards>',
      '<wiki>',
      '<previous_summary>',
      '<previous_tail>',
    ]) {
      expect(joined.split(tag)).toHaveLength(2)
    }
    expect(joined).not.toContain('<author_requests>')
    expect(joined).not.toContain('<core_wiki>')
    expect(joined).not.toContain('<voices>')
  })

  it('keeps the style cards, summary and tail out of the per-call rest', () => {
    const rest = buildDraftPrompt(input)
    expect(rest).not.toContain('<style_cards>')
    expect(rest).not.toContain('<previous_summary>')
    expect(rest).toContain('<instructions>\n서윤이 편지를 발견한다.\n</instructions>')
    expect(rest).toContain('<wiki>\n현재 회차: 4화\n</wiki>')
  })

  it('orders the prefix as requests, voices, style cards, core, then block B', () => {
    const [blockA, blockB] = buildDraftPrefix({
      ...input,
      requests: [workRequest],
      voices: [{ name: '서윤', speech: '반말' }],
      coreText: '[E1] 서윤 (인물)\n- 요약: 검객이다.',
    })
    const order = ['<author_requests>', '<voices>', '<style_cards>', '<core_wiki>'].map((tag) =>
      blockA.indexOf(tag),
    )
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(blockA).toContain('<core_wiki>\n[E1] 서윤 (인물)\n- 요약: 검객이다.\n</core_wiki>')
    expect(blockA.split('\n\n')).toHaveLength(4)
    expect(blockB).toBe(previousBlock)
  })

  it('leaves out an empty core and an empty request list', () => {
    const blockA = buildDraftPrefix({ ...input, requests: [], coreText: '' })[0]
    expect(blockA).toBe(styleCardsBlock)
    expect(blockA).not.toContain('<core_wiki>')
  })

  it('puts the request block first and the rest of the prompt unchanged after it', () => {
    const withRequests = buildDraftPrefix({ ...input, requests: [workRequest] })
    expect(withRequests[0].startsWith('<author_requests>\n')).toBe(true)
    expect(withRequests[0].endsWith(styleCardsBlock)).toBe(true)
    expect(buildDraftPrompt({ ...input, requests: [workRequest] })).toBe(buildDraftPrompt(input))
  })
})
