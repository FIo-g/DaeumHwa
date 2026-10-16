import { describe, expect, it } from 'vitest'
import {
  buildDraftPrompt,
  DRAFT_SYSTEM,
  type DraftPromptInput,
  fakeDraft,
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

describe('draft-chapter prompt', () => {
  it('uses the exact Korean system prompt', () => {
    expect(DRAFT_SYSTEM.split('\n')).toEqual([
      '당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.',
      '규칙:',
      '- 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.',
      '- 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.',
      '- 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.',
      '- 서술은 작품 문체 카드를 따른다.',
      '- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.',
      '- 목표 분량에 가깝게 쓴다.',
      '- 제목이나 설명 없이 본문만 출력한다.',
    ])
  })

  it('includes the instructions, style cards, wiki pack and previous chapter context', () => {
    const prompt = buildDraftPrompt(promptInput)
    expect(prompt).toContain('<instructions>')
    expect(prompt).toContain('서윤이 편지를 발견한다.')
    expect(prompt).toContain('서윤 말투')
    expect(prompt).toContain('작품 문체')
    expect(prompt).toContain('"그건 아니야."')
    expect(prompt).toContain('현재 회차: 4화')
    expect(prompt).toContain('3화: 서윤이 도시를 떠난다.')
    expect(prompt).toContain('마지막 문장표식 문이 닫혔다.')
    expect(prompt).toContain('5500')
    expect(prompt).toContain('4화 (새 회차)')
  })

  it('marks missing previous context as none', () => {
    const prompt = buildDraftPrompt({
      ...promptInput,
      styleCards: [],
      previousSummary: null,
      previousTail: null,
    })
    expect(prompt).toContain('(없음)')
  })
})

describe('fakeDraft', () => {
  it('starts with the demo marker and writes about six paragraphs', () => {
    const text = fakeDraft({ instructions: promptInput.instructions })
    expect(text.startsWith('(데모 초안) ')).toBe(true)
    const paragraphs = text.slice('(데모 초안) '.length).split('\n\n')
    expect(paragraphs).toHaveLength(6)
    expect(text.length).toBeGreaterThanOrEqual(600)
  })

  it('still produces at least 600 characters for empty instructions', () => {
    const text = fakeDraft({ instructions: '' })
    expect(text.length).toBeGreaterThanOrEqual(600)
  })

  it('is deterministic', () => {
    expect(fakeDraft({ instructions: '가 나다.' })).toBe(fakeDraft({ instructions: '가 나다.' }))
  })
})
