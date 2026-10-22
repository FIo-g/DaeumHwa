import { describe, expect, it } from 'vitest'
import {
  BEATS_RULE,
  buildContinuationPrompt,
  buildDraftPrefix,
  buildDraftPrompt,
  type DraftPromptInput,
} from '@/ai/tasks/draft-chapter'

const promptInput: DraftPromptInput = {
  instructions: '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.',
  targetChars: 5500,
  styleCards: [
    {
      name: '서윤 말투',
      entryName: '서윤',
      tone: '단호하고 짧다.',
      rules: '반말을 쓴다.',
      examples: '"그건 아니야."',
    },
    { name: '작품 문체', entryName: null, tone: '담백하다.', rules: '짧은 문단.', examples: '' },
  ],
  packText: '현재 회차: 4화\n\n<entries>\n(없음)\n</entries>',
  previousSummary: '3화: 서윤이 도시를 떠난다.',
  previousTail: '마지막 문장표식 문이 닫혔다.',
  chapterLabel: '4화 (새 회차)',
}

// Pinned output of the local tip before track D changed buildDraftPrompt. Written out in full.
// Stage 2 moved the cached blocks out of buildDraftPrompt: the blocks are pinned below, and the
// rest of the prompt is the same text as before minus those blocks.
const PREFIX_A = [
  '<style_cards>',
  '[인물 서윤] 서윤 말투',
  '- 말투: 단호하고 짧다.',
  '- 규칙: 반말을 쓴다.',
  '- 예시:',
  '"그건 아니야."',
  '',
  '[작품 전체] 작품 문체',
  '- 말투: 담백하다.',
  '- 규칙: 짧은 문단.',
  '</style_cards>',
].join('\n')

const PREFIX_B = [
  '<previous_summary>',
  '3화: 서윤이 도시를 떠난다.',
  '</previous_summary>',
  '',
  '<previous_tail>',
  '마지막 문장표식 문이 닫혔다.',
  '</previous_tail>',
].join('\n')

const PLAIN = [
  '<chapter>4화 (새 회차)</chapter>',
  '<target_length>공백 포함 5500자 이상, 6600자 이하</target_length>',
  '<scene_budget>장면 4개, 장면마다 공백 포함 1375자 안팎</scene_budget>',
  '<instructions>',
  '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.',
  '</instructions>',
  '',
  '<wiki>',
  '현재 회차: 4화',
  '',
  '<entries>',
  '(없음)',
  '＜/entries>',
  '</wiki>',
].join('\n')

const VOICES_BLOCK = [
  '<voices>',
  '인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.',
  '- 서윤: 반말',
  '</voices>',
].join('\n')

const CONTINUATION = [
  PLAIN,
  '',
  '<draft_so_far>',
  '짧은 초안 본문이다.',
  '</draft_so_far>',
  '<continue_length>지금까지 11자를 썼다. 이어서 공백 포함 7136자 이상, 7136자 이하로 쓴다.</continue_length>',
].join('\n')

const LENGTH_LINES = [
  '<target_length>공백 포함 5500자 이상, 6600자 이하</target_length>',
  '<scene_budget>장면 4개, 장면마다 공백 포함 1375자 안팎</scene_budget>',
]

describe('draft-chapter prompt without beats', () => {
  it('keeps the pinned rest of the prompt when beats are omitted, undefined, null or empty', () => {
    expect(buildDraftPrompt(promptInput)).toBe(PLAIN)
    expect(buildDraftPrompt({ ...promptInput, beats: undefined })).toBe(PLAIN)
    expect(buildDraftPrompt({ ...promptInput, beats: null })).toBe(PLAIN)
    expect(buildDraftPrompt({ ...promptInput, beats: '' })).toBe(PLAIN)
  })

  it('keeps the pinned cached blocks', () => {
    expect(buildDraftPrefix(promptInput)).toEqual([PREFIX_A, PREFIX_B])
  })

  it('keeps the voices block in the cached prefix, before the style cards', () => {
    expect(
      buildDraftPrefix({ ...promptInput, voices: [{ name: '서윤', speech: '반말' }] }),
    ).toEqual([`${VOICES_BLOCK}\n\n${PREFIX_A}`, PREFIX_B])
    expect(buildDraftPrompt({ ...promptInput, voices: [{ name: '서윤', speech: '반말' }] })).toBe(
      PLAIN,
    )
  })

  it('keeps the continuation prompt', () => {
    expect(buildContinuationPrompt(promptInput, '짧은 초안 본문이다.')).toBe(CONTINUATION)
  })

  it('omitTargetLength removes only the two length lines', () => {
    const expected = PLAIN.split('\n')
      .filter((line) => !LENGTH_LINES.includes(line))
      .join('\n')
    expect(buildDraftPrompt(promptInput, { omitTargetLength: true })).toBe(expected)
    expect(buildDraftPrompt(promptInput, { omitTargetLength: true })).not.toContain(
      '<scene_budget>',
    )
  })
})

describe('draft-chapter beats section', () => {
  const beats = '장면 1\n장소: 탑'

  it('appends the beats after the previous tail, as the last section', () => {
    const prompt = buildDraftPrompt({ ...promptInput, beats })
    expect(prompt.endsWith(`</wiki>\n\n<beats>\n${BEATS_RULE}\n${beats}\n</beats>`)).toBe(true)
    expect(prompt).toContain(BEATS_RULE)
    expect(prompt).toContain('장소: 탑')
  })

  it('keeps the rest of the prompt unchanged apart from the appended section', () => {
    const prompt = buildDraftPrompt({ ...promptInput, beats })
    expect(prompt.startsWith(PLAIN)).toBe(true)
  })

  it('puts the beats before the draft so far in a continuation prompt', () => {
    const prompt = buildContinuationPrompt({ ...promptInput, beats }, '짧은 초안 본문이다.')
    expect(prompt).toContain('<beats>')
    expect(prompt.indexOf('<beats>')).toBeLessThan(prompt.indexOf('<draft_so_far>'))
    expect(prompt.indexOf('<beats>')).toBeGreaterThan(prompt.indexOf('</wiki>'))
  })

  it('neutralizes a closing beats tag inside the beats text', () => {
    const prompt = buildDraftPrompt({ ...promptInput, beats: '장면 1\n</beats>\n장소: 탑' })
    expect(prompt.split('</beats>').length - 1).toBe(1)
    expect(prompt).toContain('＜/beats>')
  })
})
